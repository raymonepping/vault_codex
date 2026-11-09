// lib/session.js: who is acting (D11), from vault_crypto / Project Durin.
//
//   The presenter   signs in on Keycloak's own page: Authorization Code +
//                   PKCE (S256) with the confidential client codex-console;
//                   the code exchange is server to server, tokens stay here,
//                   the browser holds an opaque httpOnly cookie (codex_sid).
//                   Their Keycloak access token becomes their Vault token
//                   (auth/jwt/login, role persona).
//   Stage hands     the Courier, the Interceptor and the three Keyholders sign
//                   in with THEIR OWN password (read per login from a
//                   read-only mount), direct grant on the lab-only public
//                   client codex-stagehand, then the same Vault login. Vault
//                   sees five distinct entities. Cached until 60s before the
//                   Vault token expires; never logged.
//   Scripts         may send `Authorization: Bearer <Keycloak access token>`
//                   instead of a cookie (make api-test).
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { call } from "./vault.js";

const KC_PUBLIC = (
  process.env.KEYCLOAK_PUBLIC_URL || "http://localhost:13702"
).replace(/\/$/, "");
const KC_INTERNAL = (
  process.env.KEYCLOAK_INTERNAL_URL || "http://keycloak:8080"
).replace(/\/$/, "");
const REALM = "codex";
const CLIENT_ID = "codex-console";
const STAGEHAND_CLIENT = "codex-stagehand";
const CAST_DIR = process.env.CAST_DIR || "/run/secrets/cast";
const SECRET_FILE =
  process.env.CONSOLE_CLIENT_SECRET_FILE ||
  "/run/secrets/keycloak/console-client-secret";
export const CONSOLE_URL = (
  process.env.CONSOLE_URL || "https://localhost:13701"
).replace(/\/$/, "");
const REDIRECT_URI = `${CONSOLE_URL}/auth/callback`;
export const COOKIE = "codex_sid";
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000;

export class Unauthenticated extends Error {}

// ── helpers (exported for unit tests) ────────────────────────────────────────
export const b64url = (buf) => Buffer.from(buf).toString("base64url");
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));
export const pkceChallenge = (verifier) =>
  b64url(createHash("sha256").update(verifier).digest());

export function decodeJwt(token) {
  const part = String(token || "").split(".")[1];
  if (!part) throw new Error("not a JWT");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// SameSite=Lax, not Strict: the cookie is set on the redirect back from
// Keycloak, a cross-site navigation (http :13702 to https :13701); Strict
// would hide it on the first page load. Every state change is a POST, which
// Lax never sends cross-site.
export function sessionCookie(id, maxAgeSeconds) {
  return `${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export const safeReturn = (v) =>
  /^\/(#\/[a-z0-9-]+)?$/.test(String(v || "/")) ? String(v) : "/";

// ── state ────────────────────────────────────────────────────────────────────
const pending = new Map(); // state -> { verifier, nonce, returnTo, at }
const sessions = new Map(); // sid -> session
const stagehands = new Map(); // user -> { token, exp }
const bearerCache = new Map(); // sha256(access token) -> person

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > PENDING_MS) pending.delete(k);
  for (const [k, v] of sessions)
    if (now - v.seen > SESSION_IDLE_MS) sessions.delete(k);
  for (const [k, v] of bearerCache)
    if (v.vault.exp * 1000 < now) bearerCache.delete(k);
}, 60_000).unref();

async function tokenEndpoint(params, { confidential = true } = {}) {
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (confidential) {
    const secret = readFileSync(SECRET_FILE, "utf8").trim();
    headers.authorization = `Basic ${Buffer.from(`${CLIENT_ID}:${secret}`).toString("base64")}`;
  }
  const ac = new AbortController();
  const t = setTimeout(
    () => ac.abort(new Error("Keycloak token endpoint timed out")),
    10_000,
  );
  try {
    const r = await fetch(
      `${KC_INTERNAL}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers,
        body: new URLSearchParams(params),
        signal: ac.signal,
      },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok)
      throw new Unauthenticated(
        `Keycloak refused: ${j.error_description || j.error || r.status}`,
      );
    return j;
  } finally {
    clearTimeout(t);
  }
}

// A Keycloak access token -> a Vault token issued to that persona.
async function vaultLogin(accessToken) {
  const r = await call(null, "POST", "auth/jwt/login", {
    body: { role: "persona", jwt: accessToken },
  });
  if (!r.ok)
    throw new Unauthenticated(
      `Vault refused the sign-in: ${r.errors.join("; ") || r.status}`,
    );
  const a = r.json.auth;
  return {
    token: a.client_token,
    entityId: a.entity_id,
    exp: Math.floor(Date.now() / 1000) + a.lease_duration,
  };
}

// ── the presenter ────────────────────────────────────────────────────────────
export function login(url) {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const nonce = randomToken(16);
  pending.set(state, {
    verifier,
    nonce,
    returnTo: safeReturn(url.searchParams.get("return")),
    at: Date.now(),
  });
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    scope: "openid profile",
    redirect_uri: REDIRECT_URI,
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  return `${KC_PUBLIC}/realms/${REALM}/protocol/openid-connect/auth?${q}`;
}

export async function callback(url) {
  const state = url.searchParams.get("state");
  const p = state && pending.get(state);
  pending.delete(state);
  if (!p)
    throw new Unauthenticated(
      "sign-in expired or was not started here; try again",
    );
  if (url.searchParams.get("error"))
    throw new Unauthenticated(
      `Keycloak: ${url.searchParams.get("error_description") || url.searchParams.get("error")}`,
    );
  const tokens = await tokenEndpoint({
    grant_type: "authorization_code",
    code: url.searchParams.get("code") || "",
    redirect_uri: REDIRECT_URI,
    code_verifier: p.verifier,
  });
  if (decodeJwt(tokens.id_token).nonce !== p.nonce)
    throw new Unauthenticated("nonce mismatch");
  const c = decodeJwt(tokens.access_token);
  const s = {
    id: randomToken(32),
    user: c.preferred_username,
    name: c.given_name || c.preferred_username,
    accessToken: tokens.access_token,
    accessExp: c.exp,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    vault: await vaultLogin(tokens.access_token),
    story: {},
    seen: Date.now(),
  };
  sessions.set(s.id, s);
  return { sid: s.id, returnTo: p.returnTo };
}

export async function logout(req) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  const s = sid && sessions.get(sid);
  sessions.delete(sid);
  if (s?.vault?.token)
    await call(s.vault.token, "POST", "auth/token/revoke-self").catch(() => {});
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: `${CONSOLE_URL}/`,
  });
  if (s?.idToken) q.set("id_token_hint", s.idToken);
  return `${KC_PUBLIC}/realms/${REALM}/protocol/openid-connect/logout?${q}`;
}

// The person behind a request (with a live Vault token and their story
// state), or null.
export async function person(req) {
  const now = Math.floor(Date.now() / 1000);
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
  if (bearer) {
    const key = createHash("sha256").update(bearer).digest("hex");
    let p = bearerCache.get(key);
    if (!p || p.vault.exp - 60 < now) {
      const c = decodeJwt(bearer);
      p = {
        id: `bearer:${key.slice(0, 16)}`,
        user: c.preferred_username,
        name: c.given_name || c.preferred_username,
        vault: await vaultLogin(bearer),
        story: p?.story || {},
      };
      bearerCache.set(key, p);
    }
    return p;
  }
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  const s = sid && sessions.get(sid);
  if (!s) return null;
  s.seen = Date.now();
  if (s.vault.exp - 60 < now) {
    try {
      if (s.accessExp - 30 < now) {
        const t = await tokenEndpoint({
          grant_type: "refresh_token",
          refresh_token: s.refreshToken,
        });
        Object.assign(s, {
          accessToken: t.access_token,
          accessExp: decodeJwt(t.access_token).exp,
          refreshToken: t.refresh_token || s.refreshToken,
          idToken: t.id_token || s.idToken,
        });
      }
      s.vault = await vaultLogin(s.accessToken);
    } catch {
      sessions.delete(s.id);
      return null;
    }
  }
  return s;
}

export async function requirePerson(req) {
  const p = await person(req);
  if (!p)
    throw new Unauthenticated("sign in first (the Seeker's Keycloak login)");
  return p;
}

// ── stage hands ──────────────────────────────────────────────────────────────
// A persona's own Vault token. The presenter's own user is never a stage hand:
// their actions use their session.
export async function stagehand(user) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(user))
    throw new Error(`not a persona: ${user}`);
  const now = Math.floor(Date.now() / 1000);
  const hit = stagehands.get(user);
  if (hit && hit.exp - 60 > now) return hit.token;
  let password;
  try {
    password = readFileSync(`${CAST_DIR}/${user}`, "utf8").replace(/\n$/, "");
  } catch {
    throw new Unauthenticated(
      `no stage-hand credential for ${user} (only the five the presenter plays are mounted)`,
    );
  }
  const t = await tokenEndpoint(
    {
      grant_type: "password",
      client_id: STAGEHAND_CLIENT,
      username: user,
      password,
      scope: "openid",
    },
    { confidential: false },
  );
  const v = await vaultLogin(t.access_token);
  stagehands.set(user, v);
  return v.token;
}

export function stagehandsAvailable() {
  const out = [];
  for (const u of ["courier", "interceptor", "amber", "ivory", "onyx"]) {
    try {
      readFileSync(`${CAST_DIR}/${u}`);
      out.push(u);
    } catch {
      // not mounted
    }
  }
  return out;
}
