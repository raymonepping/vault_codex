// lib/ledger.js: the Epilogue. Reads the file audit log of all three nodes
// (read-only mounts; the node that receives a request logs it, P23),
// incrementally by byte offset, keeps the `response` entries of story paths
// and maps each to a story event. HMAC'd fields stay HMAC'd: the ledger never
// knows an answer, it can only confirm a guess (sys/audit-hash, P22).
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

const MAX_EVENTS = 20_000;

// The only paths classify() turns into story events. Everything else (token
// lookups, stage reads, health) is dropped while reading: less memory, less
// to sort on every poll.
export const STORY_PATHS = new Set([
  "auth/jwt/login",
  "transform/decode/codex-scribe",
  "transit/decrypt/codex-clues",
  "transit/decrypt/codex-cryptex",
  "codex/data/stage/act-2",
  "sys/wrapping/unwrap",
  "sys/wrapping/lookup",
  "sys/control-group/authorize",
  "transit/keys/codex-clues/rotate",
  "transit/keys/codex-clues/config",
  "transit/keys/codex-clues/trim",
]);

// "vault-1=/audit/vault-1/audit.log,..." -> [{ node, file }]
export function parseLogSpec(spec) {
  return String(spec || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return { node: p.slice(0, i), file: p.slice(i + 1) };
    });
}

// Who made the call, in story names: a persona (jwt-<user>), the Archivist
// (AppRole codex-archivist) or a tool token (vcdx-...).
export function who(auth) {
  if (!auth) return "unauthenticated";
  const role = auth.metadata?.role_name;
  if (role === "codex-archivist") return "archivist";
  if (role === "codex-rotator") return "rotator";
  const d = String(auth.display_name || "");
  if (d.startsWith("jwt-")) return d.slice(4);
  if (d.startsWith("token-vcdx-")) return d.slice(11);
  return d || "unknown";
}

// The lab's own checks (Ansible validate, make verify, make doctor) sign the
// cast in through Keycloak client codex-automation; Vault maps the token's azp
// into metadata.client. Those calls are not the show.
export const isCheck = (e) => e?.auth?.metadata?.client === "codex-automation";

// The audit log keeps most refusals as a bare "invalid request" (Vault's own
// text reaches only the caller), so the story is read from STATE, in time
// order: an unwrap is matched to what it opens through the HMAC of its token
// (the issuing response's wrap_info.token carries the same HMAC), and a
// refused decrypt of the map after the burn is ash.
export function newContext() {
  return { letters: new Set(), burned: false };
}

// One audit `response` entry -> a story event, or null for anything else.
// `acts` maps an HMAC'd ciphertext (from sys/audit-hash) to its act id;
// `ctx` carries what earlier entries established (newContext()).
export function classify(e, acts = {}, ctx = newContext()) {
  if (e?.type !== "response") return null;
  const path = e.request?.path || "";
  const err = e.error || "";
  const ok = !err;
  const denied = /permission denied/.test(err);
  const wrapped = Boolean(e.response?.wrap_info);
  const base = (act, kind) => ({
    time: e.time,
    who: who(e.auth),
    act,
    kind,
    path,
    ok,
    error: err
      ? err
          .replace(/^\d+ errors? occurred:\s*/, "")
          .replace(/\*\s*/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : null,
    request_id: e.request?.id || null,
    context: e.request?.data?.context || null,
  });
  switch (path) {
    case "auth/jwt/login":
      return ok ? base(null, "signed in") : null;
    case "transform/decode/codex-scribe":
      return base(
        "prologue",
        ok
          ? "manuscript decoded"
          : denied
            ? "decode not permitted"
            : "decode refused",
      );
    case "transit/decrypt/codex-clues": {
      const act = acts[e.request?.data?.ciphertext] || null;
      if (ok) return base(act, "answer accepted");
      if (denied) return base(act, "decrypt not permitted");
      return base(
        act,
        ctx.burned ? "refused: the map is ash" : "answer refused",
      );
    }
    case "transit/decrypt/codex-cryptex":
      if (wrapped) return base("act-3", "council request held");
      return base(
        "act-3",
        ok
          ? "cryptex opened"
          : denied
            ? "request not permitted"
            : "council request refused",
      );
    case "codex/data/stage/act-2":
      if (!wrapped) return null;
      if (e.response.wrap_info.token)
        ctx.letters.add(e.response.wrap_info.token);
      return base("act-2", "sealed letter issued");
    case "sys/wrapping/unwrap": {
      const letter = ctx.letters.has(e.request?.data?.token);
      if (letter)
        return base(
          "act-2",
          ok ? "letter opened" : "the seal is broken: already opened",
        );
      return base("act-3", ok ? "cryptex opened" : "the cryptex stays shut");
    }
    case "sys/wrapping/lookup":
      return base(
        "act-2",
        ok ? "seal inspected: intact" : "seal inspected: broken",
      );
    case "sys/control-group/authorize":
      return base("act-3", ok ? "approval" : "approval not permitted");
    case "transit/keys/codex-clues/rotate":
      return base("act-4", "the map burns: new key version");
    case "transit/keys/codex-clues/config":
      if (ok) ctx.burned = true;
      return base("act-4", "the map burns: old versions refused");
    case "transit/keys/codex-clues/trim":
      return base("act-4", "the ashes are swept: old versions gone");
    default:
      return null;
  }
}

// Split a chunk of log text into whole JSON lines; returns [entries, rest].
export function parseChunk(text) {
  const lines = text.split("\n");
  const rest = lines.pop();
  const out = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      // a torn or foreign line: skip it
    }
  }
  return [out, rest];
}

export function createLedger(spec = process.env.AUDIT_LOGS) {
  const files = parseLogSpec(spec).map((f) => ({
    ...f,
    offset: 0,
    rest: "",
    entries: [],
  }));

  function refresh() {
    for (const f of files) {
      let fd;
      try {
        fd = openSync(f.file, "r");
        const size = fstatSync(fd).size;
        if (size < f.offset)
          Object.assign(f, { offset: 0, rest: "", entries: [] }); // a new file
        while (f.offset < size) {
          const len = Math.min(size - f.offset, 4 * 1024 * 1024);
          const buf = Buffer.alloc(len);
          const n = readSync(fd, buf, 0, len, f.offset);
          if (n <= 0) break;
          f.offset += n;
          const [entries, rest] = parseChunk(
            f.rest + buf.subarray(0, n).toString("utf8"),
          );
          f.rest = rest;
          for (const e of entries)
            if (e.type === "response" && STORY_PATHS.has(e.request?.path)) f.entries.push(e);
          if (f.entries.length > MAX_EVENTS)
            f.entries.splice(0, f.entries.length - MAX_EVENTS);
        }
        f.error = null;
      } catch (e) {
        f.error = e.code || e.message;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }
  }

  return {
    status() {
      refresh();
      return files.map(({ node, file, offset, error }) => ({
        node,
        file,
        bytes: offset,
        error: error || null,
      }));
    },
    // Story events since an ISO time, all nodes merged, oldest first (the
    // classification depends on order: letters before their unwraps, the burn
    // before the ash).
    events({ since, acts = {} } = {}) {
      refresh();
      const all = [];
      for (const f of files)
        for (const e of f.entries)
          if ((!since || e.time >= since) && !isCheck(e)) all.push([e, f.node]);
      all.sort((a, b) =>
        a[0].time < b[0].time ? -1 : a[0].time > b[0].time ? 1 : 0,
      );
      const ctx = newContext();
      const out = [];
      for (const [e, node] of all) {
        const ev = classify(e, acts, ctx);
        if (ev) out.push({ ...ev, node });
      }
      return out;
    },
    // How many story-path calls since `since` were the lab's checks (left out).
    hidden({ since } = {}) {
      refresh();
      let n = 0;
      for (const f of files) for (const e of f.entries) if ((!since || e.time >= since) && isCheck(e)) n++;
      return n;
    },
  };
}

// Answer attempts whose HMAC'd context equals the hash of a guess.
export function confirm(events, hash) {
  return events
    .filter(
      (e) =>
        e.context &&
        e.context === hash &&
        /answer|request|cryptex|map/.test(e.kind),
    )
    .map(({ time, who: w, act, kind, ok, node }) => ({
      time,
      who: w,
      act,
      kind,
      ok,
      node,
    }));
}
