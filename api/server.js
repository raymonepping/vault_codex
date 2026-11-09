// codex-api: the Archivist's desk. Plain node:http, no dependencies (D13).
// Vault makes every decision; this file carries requests, normalises what the
// presenter types (lib/normalise.js) and returns Vault's answer verbatim.
// There is no answer-checking code and no answer anywhere in this service.
//
//   GET  /auth/login | /auth/callback | /auth/logout   the presenter (Keycloak, PKCE)
//   GET  /api/me                      who is signed in, as Vault sees them
//   GET  /api/codex                   the story (public file) + the stage as Vault holds it
//   POST /api/prologue/decode         the presenter decodes the manuscript
//   POST /api/act/1/answer {answer}   decrypt C1 with the answer as context
//   POST /api/act/2/letter            the Archivist seals a letter (wrapped read of C2)
//   GET  /api/act/2/state             does this session hold a sealed or a delivered letter?
//   POST /api/act/2/intercept         the Interceptor opens it first
//   POST /api/act/2/deliver           the Courier inspects the seal, then opens it
//   POST /api/act/2/answer {answer}   decrypt the delivered C2
//   POST /api/act/3/request {answer, as?}  ask the council for the cryptex
//   GET  /api/act/3/status            the council's decision so far
//   POST /api/act/3/approve {keyholder}
//   POST /api/act/3/open              the requester unwraps the cryptex
//   POST /api/act/4/answer {answer}   the final message
//   POST /api/act/4/burn | /api/act/4/trim   the Archivist burns the map
//   POST /api/act/4/replay {answer}   try act 1 again: ash
//   GET  /api/ledger?since=           the merged audit timeline
//   POST /api/ledger/confirm {guess}  was this guess ever tried? (HMAC only)
//   GET  /api/layers                  phases and gates (.build/)
//   GET  /api/health                  nodes, the Archivist's token, the audit logs
import http from "node:http";
import { readFileSync } from "node:fs";
import {
  call,
  VaultError,
  VAULT_NODES,
  nodeHealth,
  tokenPresent,
  archivistToken,
} from "./lib/vault.js";
import * as session from "./lib/session.js";
import { context } from "./lib/normalise.js";
import { said, short } from "./lib/said.js";
import { createRate } from "./lib/rate.js";
import { createLedger, confirm } from "./lib/ledger.js";
import {
  loadCodex,
  keyholdersOf,
  actorFor,
  shutReason,
  StoryError,
} from "./lib/story.js";

const PORT = Number(process.env.PORT || 3000);
const WRAP_TTL = Number(process.env.WRAP_TTL || 120);
const BUILD_DIR = process.env.BUILD_DIR || "/build";
const MAX_BODY = 16 * 1024;
const codex = loadCodex();
const KEYHOLDERS = keyholdersOf(codex);
const rate = createRate();
const ledger = createLedger();

class BadRequest extends StoryError {
  constructor(message) {
    super(400, message);
  }
}

// ── plumbing ─────────────────────────────────────────────────────────────────
function send(res, code, obj, headers = {}) {
  res.vaultRequestId = obj?.vault?.request_id || null;
  res.writeHead(code, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new BadRequest("request body too large");
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const b = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b;
  } catch {
    throw new BadRequest("the body must be a JSON object");
  }
}

const answerOf = (b) => {
  if (typeof b.answer !== "string" || !b.answer.trim() || b.answer.length > 64)
    throw new BadRequest("answer: one word, at most 64 characters");
  return b.answer;
};

// The token for an actor (lib/story.js decides who).
async function tokenFor(actor, person) {
  if (actor.kind === "archivist") return archivistToken();
  if (actor.kind === "person") return person.vault.token;
  return session.stagehand(actor.user);
}

// One Vault call as an actor, with its "Vault said" block.
async function act(actor, person, method, path, opts) {
  const r = await call(await tokenFor(actor, person), method, path, opts);
  return { r, vault: said(actor.user, method, path, r) };
}

const archivist = { kind: "archivist", user: "archivist" };

async function stageRecord(name) {
  const { r, vault } = await act(
    archivist,
    null,
    "GET",
    `codex/data/stage/${name}`,
  );
  if (!r.ok)
    throw new StoryError(
      r.status === 404 ? 409 : 502,
      `the stage holds no ${name} (make stage): ${r.errors.join("; ") || r.status}`,
    );
  return { data: r.json.data.data, vault };
}

// A letter, a delivered page and a council request belong to the stage that
// made them. After make stage-reset the keys are new and the old ciphertexts
// unreadable, so the right answer would be refused: forget them instead.
const STORY_ITEMS = { "act-2": ["letter", "delivered", "loot"], "act-3": ["council"] };
function rememberStage(p, actId, stagedAt) {
  (p.story.stagedAt ||= {})[actId] = stagedAt;
}
async function forgetStale(p, actId) {
  const at = p.story.stagedAt?.[actId];
  if (!at) return;
  const { data } = await stageRecord(actId);
  if (data.staged_at === at) return;
  for (const k of STORY_ITEMS[actId]) delete p.story[k];
  delete p.story.stagedAt[actId];
}

const actPublic = (id) => codex.acts.find((a) => a.id === id);
const plain = (r) =>
  Buffer.from(r.json.data.plaintext, "base64").toString("utf8");

// Decrypt one staged act with an answer as the context, as the presenter.
async function answerAct(person, actId, ciphertext, key, answer) {
  const limit = rate.take(person.id);
  if (!limit.ok)
    throw new StoryError(
      429,
      `slow down: ${Math.ceil(limit.retryAfterMs / 1000)}s until the next answer (stage pacing)`,
    );
  const { r, vault } = await act(
    { kind: "person", user: person.user },
    person,
    "POST",
    `transit/decrypt/${key}`,
    {
      body: { ciphertext, context: context(answer) },
    },
  );
  if (r.ok)
    return { outcome: "opened", reveal: { act: actId, text: plain(r) }, vault };
  return { outcome: r.status === 403 ? "forbidden" : "refused", vault };
}

// ── handlers ─────────────────────────────────────────────────────────────────
const routes = {
  "GET /api/health": async () => {
    const nodes = await Promise.all(VAULT_NODES.map(nodeHealth));
    const agent = tokenPresent();
    return {
      ok: agent && nodes.some((n) => n.reachable && !n.sealed),
      nodes,
      archivist: { tokenPresent: agent },
      audit: ledger.status(),
      stagehands: session.stagehandsAvailable(),
      // When the stage was set: the console forgets a rehearsal on change.
      stagedAt: await stageRecord("manuscript").then((s) => s.data.staged_at, () => null),
      vaultUi: (process.env.VAULT_UI_URL || "").replace(/\/$/, "") || null,
    };
  },

  "GET /api/me": async (req) => {
    const p = await session.person(req);
    if (!p) return { signedIn: false, signIn: "/auth/login" };
    const r = await call(p.vault.token, "GET", "auth/token/lookup-self");
    const d = r.json?.data || {};
    return {
      signedIn: true,
      user: p.user,
      name: p.name,
      entity: d.entity_id || null,
      display_name: d.display_name,
      policies: d.identity_policies || [],
      expires: new Date(p.vault.exp * 1000).toISOString(),
    };
  },

  "GET /api/codex": async () => {
    const keys = {};
    for (const k of ["codex-clues", "codex-cryptex"]) {
      const { r } = await act(archivist, null, "GET", `transit/keys/${k}`);
      keys[k] = r.ok
        ? {
            latest_version: r.json.data.latest_version,
            min_decryption_version: r.json.data.min_decryption_version,
            min_available_version: r.json.data.min_available_version,
            versions: Object.keys(r.json.data.keys).map(Number),
          }
        : { missing: true, status: r.status };
    }
    const stage = {};
    for (const n of ["manuscript", "act-1", "act-2", "act-3", "act-4"]) {
      const { r } = await act(archivist, null, "GET", `codex/data/stage/${n}`);
      const d = r.ok ? r.json.data.data : null;
      // The manuscript's encoded line is what the audience sees anyway; ciphertexts stay out.
      stage[n] = d
        ? {
            staged_at: d.staged_at,
            key_version: d.key_version ? Number(d.key_version) : null,
            digest: d.codex_digest,
            ...(n === "manuscript" ? { value: d.value } : {}),
          }
        : null;
    }
    return {
      codex: { ...codex, keyholders: KEYHOLDERS },
      keys,
      stage,
      wrapTtl: WRAP_TTL,
    };
  },

  // ── Prologue ─────────────────────────────────────────────────────────────
  "POST /api/prologue/decode": async (req) => {
    const p = await session.requirePerson(req);
    const ms = await stageRecord("manuscript");
    const a = actPublic("prologue");
    const { r, vault } = await act(
      actorFor("prologue.decode", { person: p }),
      p,
      "POST",
      `transform/decode/${a.role}`,
      {
        body: { value: ms.data.value, transformation: a.transformation },
      },
    );
    if (!r.ok)
      return {
        outcome: r.status === 403 ? "forbidden" : "refused",
        manuscript: ms.data.value,
        vault,
      };
    return {
      outcome: "decoded",
      manuscript: ms.data.value,
      reveal: {
        act: "prologue",
        date: r.json.data.decoded_value,
        text: a.riddle,
      },
      vault,
    };
  },

  // ── Act I ────────────────────────────────────────────────────────────────
  "POST /api/act/1/answer": async (req) => {
    const p = await session.requirePerson(req);
    const answer = answerOf(await readBody(req));
    const s = await stageRecord("act-1");
    return answerAct(p, "act-1", s.data.ciphertext, s.data.key, answer);
  },

  // ── Act II ───────────────────────────────────────────────────────────────
  "POST /api/act/2/letter": async (req) => {
    const p = await session.requirePerson(req);
    const staged = await stageRecord("act-2");
    const { r, vault } = await act(
      archivist,
      p,
      "GET",
      "codex/data/stage/act-2",
      { headers: { "X-Vault-Wrap-TTL": String(WRAP_TTL) } },
    );
    if (!r.ok || !r.json?.wrap_info) return { outcome: "refused", vault };
    p.story.letter = {
      token: r.json.wrap_info.token,
      accessor: r.json.wrap_info.accessor,
      issued: r.json.wrap_info.creation_time,
    };
    delete p.story.delivered;
    delete p.story.loot;
    rememberStage(p, "act-2", staged.data.staged_at);
    return { outcome: "sealed", letter: vault.wrap_info, vault };
  },

  // Where this session's letter is: the page asks instead of guessing.
  "GET /api/act/2/state": async (req) => {
    const p = await session.requirePerson(req);
    await forgetStale(p, "act-2");
    return {
      letter: Boolean(p.story.letter),
      delivered: Boolean(p.story.delivered),
    };
  },

  "POST /api/act/2/intercept": async (req) => {
    const p = await session.requirePerson(req);
    await forgetStale(p, "act-2");
    const letter = p.story.letter;
    if (!letter)
      throw new StoryError(
        409,
        "no letter is on its way: ask the Archivist to seal one",
      );
    const actor = actorFor("act2.intercept", { person: p });
    const { r, vault } = await act(actor, p, "POST", "sys/wrapping/unwrap", {
      body: { token: letter.token },
    });
    if (!r.ok) return { outcome: "refused", vault };
    const loot = r.json.data.data.ciphertext;
    p.story.loot = loot;
    // The loot is a ciphertext the Interceptor's policy cannot decrypt.
    const s = await stageRecord("act-2");
    const attempt = await act(
      actor,
      p,
      "POST",
      `transit/decrypt/${s.data.key}`,
      { body: { ciphertext: loot } },
    );
    return {
      outcome: "intercepted",
      loot: short(loot),
      vault,
      attempt: attempt.vault,
    };
  },

  "POST /api/act/2/deliver": async (req) => {
    const p = await session.requirePerson(req);
    await forgetStale(p, "act-2");
    const letter = p.story.letter;
    if (!letter)
      throw new StoryError(
        409,
        "no letter is on its way: ask the Archivist to seal one",
      );
    const actor = actorFor("act2.deliver", { person: p });
    const look = await act(actor, p, "POST", "sys/wrapping/lookup", {
      body: { token: letter.token },
    });
    if (!look.r.ok)
      return { outcome: "broken", seal: "broken", vault: look.vault };
    const { r, vault } = await act(actor, p, "POST", "sys/wrapping/unwrap", {
      body: { token: letter.token },
    });
    if (!r.ok)
      return { outcome: "broken", seal: "broken", lookup: look.vault, vault };
    p.story.delivered = r.json.data.data.ciphertext;
    delete p.story.letter;
    return {
      outcome: "delivered",
      seal: "intact",
      letter: short(p.story.delivered),
      lookup: look.vault,
      vault,
    };
  },

  "POST /api/act/2/answer": async (req) => {
    const p = await session.requirePerson(req);
    const answer = answerOf(await readBody(req));
    await forgetStale(p, "act-2");
    if (!p.story.delivered)
      throw new StoryError(
        409,
        "the letter has not reached you: the Courier delivers it first",
      );
    const s = await stageRecord("act-2");
    return answerAct(p, "act-2", p.story.delivered, s.data.key, answer);
  },

  // ── Act III ──────────────────────────────────────────────────────────────
  "POST /api/act/3/request": async (req) => {
    const p = await session.requirePerson(req);
    const b = await readBody(req);
    const answer = answerOf(b);
    const actor = actorFor("act3.request", {
      as: b.as,
      person: p,
      keyholders: KEYHOLDERS,
    });
    const limit = rate.take(p.id);
    if (!limit.ok)
      throw new StoryError(
        429,
        `slow down: ${Math.ceil(limit.retryAfterMs / 1000)}s until the next answer (stage pacing)`,
      );
    const s = await stageRecord("act-3");
    const { r, vault } = await act(
      actor,
      p,
      "POST",
      `transit/decrypt/${s.data.key}`,
      { body: { ciphertext: s.data.ciphertext, context: context(answer) } },
    );
    if (!r.ok || !r.json?.wrap_info)
      return { outcome: r.status === 403 ? "forbidden" : "refused", vault };
    p.story.council = {
      token: r.json.wrap_info.token,
      accessor: r.json.wrap_info.accessor,
      requester: actor.user,
    };
    rememberStage(p, "act-3", s.data.staged_at);
    return {
      outcome: "held",
      requester: actor.user,
      accessor: r.json.wrap_info.accessor,
      vault,
    };
  },

  "GET /api/act/3/status": async (req) => {
    const p = await session.requirePerson(req);
    await forgetStale(p, "act-3");
    const c = p.story.council;
    if (!c) return { outcome: "none", requester: null };
    const { r, vault } = await act(
      archivist,
      p,
      "POST",
      "sys/control-group/request",
      { body: { accessor: c.accessor } },
    );
    if (!r.ok) return { outcome: "unknown", requester: c.requester, vault };
    const d = r.json.data;
    return {
      outcome: d.approved ? "approved" : "waiting",
      requester: c.requester,
      approved: d.approved,
      authorizations: (d.authorizations || []).map((a) => a.entity_name),
      needed: codex.council.approvals,
      vault,
    };
  },

  "POST /api/act/3/approve": async (req) => {
    const p = await session.requirePerson(req);
    await forgetStale(p, "act-3");
    const b = await readBody(req);
    const c = p.story.council;
    if (!c)
      throw new StoryError(
        409,
        "no council request is pending: request the cryptex first",
      );
    const actor = actorFor("act3.approve", {
      keyholder: b.keyholder,
      person: p,
      keyholders: KEYHOLDERS,
    });
    const { r, vault } = await act(
      actor,
      p,
      "POST",
      "sys/control-group/authorize",
      { body: { accessor: c.accessor } },
    );
    if (!r.ok)
      return { outcome: r.status === 403 ? "forbidden" : "refused", vault };
    return {
      outcome: r.json.data.approved ? "approved" : "counted",
      approved: r.json.data.approved,
      vault,
    };
  },

  "POST /api/act/3/open": async (req) => {
    const p = await session.requirePerson(req);
    await forgetStale(p, "act-3");
    const c = p.story.council;
    const actor = actorFor("act3.open", { person: p, requester: c?.requester });
    const { r, vault } = await act(actor, p, "POST", "sys/wrapping/unwrap", {
      body: { token: c.token },
    });
    if (r.ok) {
      delete p.story.council;
      return {
        outcome: "opened",
        reveal: { act: "act-3", text: plain(r) },
        vault,
      };
    }
    const st = await act(archivist, p, "POST", "sys/control-group/request", {
      body: { accessor: c.accessor },
    });
    const status = st.r.ok ? st.r.json.data : null;
    if (/authentication failed/.test(r.errors.join(" ")))
      delete p.story.council;
    return {
      outcome: "shut",
      why: shutReason(r.errors, status, c.requester),
      vault,
    };
  },

  // ── Act IV ───────────────────────────────────────────────────────────────
  "POST /api/act/4/answer": async (req) => {
    const p = await session.requirePerson(req);
    const answer = answerOf(await readBody(req));
    const s = await stageRecord("act-4");
    const out = await answerAct(
      p,
      "act-4",
      s.data.ciphertext,
      s.data.key,
      answer,
    );
    if (out.reveal) out.reveal.title = codex.final_message_title;
    return out;
  },

  "POST /api/act/4/burn": async (req) => {
    const p = await session.requirePerson(req);
    // Already burned (the minimum is the latest, above 1): a second press, or
    // a retried request, must not rotate again.
    const before = await act(archivist, p, "GET", "transit/keys/codex-clues");
    const k = before.r.json?.data;
    if (k && k.latest_version > 1 && k.min_decryption_version === k.latest_version)
      return {
        outcome: "burned",
        already: true,
        latest_version: k.latest_version,
        min_decryption_version: k.min_decryption_version,
        vault: before.vault,
      };
    const rot = await act(
      archivist,
      p,
      "POST",
      "transit/keys/codex-clues/rotate",
    );
    if (!rot.r.ok) return { outcome: "refused", vault: rot.vault };
    const key = await act(archivist, p, "GET", "transit/keys/codex-clues");
    const latest = key.r.json.data.latest_version;
    const cfg = await act(
      archivist,
      p,
      "POST",
      "transit/keys/codex-clues/config",
      {
        body: {
          min_decryption_version: latest,
          min_encryption_version: latest,
        },
      },
    );
    return {
      outcome: cfg.r.ok ? "burned" : "refused",
      latest_version: latest,
      min_decryption_version: latest,
      rotate: rot.vault,
      vault: cfg.vault,
    };
  },

  "POST /api/act/4/replay": async (req) => {
    const p = await session.requirePerson(req);
    const answer = answerOf(await readBody(req));
    const s = await stageRecord("act-1");
    const out = await answerAct(
      p,
      "act-1",
      s.data.ciphertext,
      s.data.key,
      answer,
    );
    return out.outcome === "refused" &&
      /too old/.test(out.vault.errors.join(" "))
      ? { ...out, outcome: "ash" }
      : out;
  },

  "POST /api/act/4/trim": async (req) => {
    const p = await session.requirePerson(req);
    const key = await act(archivist, p, "GET", "transit/keys/codex-clues");
    const min = key.r.json?.data?.min_decryption_version;
    const { r, vault } = await act(
      archivist,
      p,
      "POST",
      "transit/keys/codex-clues/trim",
      { body: { min_available_version: min } },
    );
    const after = await act(archivist, p, "GET", "transit/keys/codex-clues");
    return {
      outcome: r.ok ? "trimmed" : "refused",
      versions: after.r.ok
        ? Object.keys(after.r.json.data.keys).map(Number)
        : null,
      vault,
    };
  },

  // ── Epilogue ─────────────────────────────────────────────────────────────
  "GET /api/ledger": async (req, url) => {
    await session.requirePerson(req);
    const since =
      url.searchParams.get("since") ||
      (await stageRecord("manuscript")).data.staged_at;
    const events = ledger.events({ since, acts: await actHashes() });
    return {
      since,
      count: events.length,
      hidden: ledger.hidden({ since }),
      events: events.map(({ context: _c, ...e }) => e),
      nodes: ledger.status(),
    };
  },

  "POST /api/ledger/confirm": async (req) => {
    const p = await session.requirePerson(req);
    const b = await readBody(req);
    if (typeof b.guess !== "string" || !b.guess.trim() || b.guess.length > 64)
      throw new BadRequest("guess: one word, at most 64 characters");
    const { r, vault } = await act(
      archivist,
      p,
      "POST",
      "sys/audit-hash/file",
      { body: { input: context(b.guess) } },
    );
    if (!r.ok) return { outcome: "refused", vault };
    const since = (await stageRecord("manuscript")).data.staged_at;
    const tried = confirm(
      ledger.events({ since, acts: await actHashes() }),
      r.json.data.hash,
    );
    return {
      outcome: tried.length ? "tried" : "never tried",
      tried,
      vault: {
        ...vault,
        data: { hash: `${r.json.data.hash.slice(0, 20)}...` },
      },
    };
  },

  "GET /api/layers": async () => {
    const read = (f) => {
      try {
        return JSON.parse(readFileSync(`${BUILD_DIR}/${f}`, "utf8"));
      } catch {
        return null;
      }
    };
    return {
      layers: read("layers.json"),
      convergence: read("convergence.json"),
    };
  },
};

// The HMAC of each staged ciphertext, so the ledger can say which act an
// answer attempt was for. Cached per stage.
let hashCache = { key: null, acts: {} };
async function actHashes() {
  const recs = {};
  for (const n of ["act-1", "act-2", "act-4"])
    recs[n] = (await stageRecord(n)).data;
  const key = Object.values(recs)
    .map((d) => d.staged_at)
    .join("|");
  if (hashCache.key === key) return hashCache.acts;
  const acts = {};
  for (const [n, d] of Object.entries(recs)) {
    const r = await call(archivistToken(), "POST", "sys/audit-hash/file", {
      body: { input: d.ciphertext },
    });
    if (r.ok) acts[r.json.data.hash] = n;
  }
  hashCache = { key, acts };
  return acts;
}

// ── auth routes (redirects) ──────────────────────────────────────────────────
function redirect(res, location, cookie) {
  res.writeHead(302, {
    location,
    "cache-control": "no-store",
    ...(cookie ? { "set-cookie": cookie } : {}),
  });
  res.end();
}

async function authRoute(req, res, url) {
  try {
    if (url.pathname === "/auth/login")
      return redirect(res, session.login(url));
    if (url.pathname === "/auth/callback") {
      const { sid, returnTo } = await session.callback(url);
      return redirect(
        res,
        `${session.CONSOLE_URL}${returnTo}`,
        session.sessionCookie(sid, 7200),
      );
    }
    if (url.pathname === "/auth/logout")
      return redirect(
        res,
        await session.logout(req),
        session.sessionCookie("", 0),
      );
  } catch (e) {
    console.error(`[codex-api] ${url.pathname}: ${e.message}`);
    return redirect(res, `${session.CONSOLE_URL}/#/?signin=failed`);
  }
  return send(res, 404, { ok: false, error: "not found" });
}

export const server = http.createServer(async (req, res) => {
  res.setHeader("x-content-type-options", "nosniff");
  const url = new URL(req.url, "http://api");
  // One JSON line per request; vault_request_id joins it to the audit log.
  // Polls that went fine stay quiet.
  const t0 = Date.now();
  res.on("finish", () => {
    if (req.method === "GET" && res.statusCode < 400 && /^\/api\/(health|codex|layers|act\/[23]\/(state|status))$/.test(url.pathname)) return;
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      method: req.method,
      path: url.pathname,
      status: res.statusCode,
      ms: Date.now() - t0,
      vault_request_id: res.vaultRequestId || null,
    }));
  });
  if (req.method === "GET" && url.pathname.startsWith("/auth/"))
    return authRoute(req, res, url);
  if (session.crossSiteWrite(req))
    return send(res, 403, {
      ok: false,
      error: "refused: this request came from another site (Sec-Fetch-Site)",
    });
  try {
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) {
      const known = Object.keys(routes).some((k) =>
        k.endsWith(` ${url.pathname}`),
      );
      return send(res, known ? 405 : 404, {
        ok: false,
        error: known ? "method not allowed" : "not found",
      });
    }
    const out = await handler(req, url);
    return send(res, url.pathname === "/api/health" && !out.ok ? 503 : 200, {
      ok: true,
      ...out,
    });
  } catch (e) {
    if (e instanceof session.Unauthenticated)
      return send(res, 401, {
        ok: false,
        error: e.message,
        signIn: "/auth/login",
      });
    if (e instanceof StoryError)
      return send(res, e.status, { ok: false, error: e.message });
    if (e instanceof VaultError)
      return send(res, 502, { ok: false, error: e.message });
    console.error(`[codex-api] ${req.method} ${url.pathname}:`, e?.stack || e);
    return send(res, 500, { ok: false, error: "internal error" });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () =>
    console.log(
      `[codex-api] listening on :${PORT}, Vault ${VAULT_NODES.join(" ")}`,
    ),
  );
}
