import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionCookie,
  parseCookies,
  pkceChallenge,
  safeReturn,
  decodeJwt,
  crossSiteWrite,
  login,
  callback,
  Unauthenticated,
  COOKIE,
} from "../lib/session.js";

test("the session cookie is httpOnly, Secure and SameSite", () => {
  const c = sessionCookie("abc", 60);
  assert.match(c, new RegExp(`^${COOKIE}=abc;`));
  for (const flag of [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=60",
  ])
    assert.ok(c.includes(flag), flag);
});

test("cookies parse, first value wins", () => {
  assert.deepEqual(parseCookies("a=1; b=x%20y; a=2"), { a: "1", b: "x y" });
});

test("PKCE S256 matches RFC 7636's example", () => {
  assert.equal(
    pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("only same-origin hash routes survive the round trip", () => {
  assert.equal(safeReturn("/#/act-2"), "/#/act-2");
  assert.equal(safeReturn("https://evil.example/"), "/");
  assert.equal(safeReturn("//evil.example"), "/");
});

test("decodeJwt reads the payload", () => {
  const t = `x.${Buffer.from(JSON.stringify({ preferred_username: "seeker" })).toString("base64url")}.y`;
  assert.equal(decodeJwt(t).preferred_username, "seeker");
});

test("a write from another site (another localhost port) is refused, this origin and scripts are not", () => {
  const req = (method, site) => ({ method, headers: site ? { "sec-fetch-site": site } : {} });
  assert.equal(crossSiteWrite(req("POST", "same-site")), true);
  assert.equal(crossSiteWrite(req("POST", "cross-site")), true);
  assert.equal(crossSiteWrite(req("POST", "same-origin")), false);
  assert.equal(crossSiteWrite(req("POST", "none")), false);
  assert.equal(crossSiteWrite(req("POST")), false);
  assert.equal(crossSiteWrite(req("GET", "cross-site")), false);
});

test("the callback refuses an unknown state, and a state used once cannot be used again", async () => {
  await assert.rejects(callback(new URL("https://c/auth/callback?state=never-issued&code=x")), Unauthenticated);
  const state = new URL(login(new URL("https://c/auth/login"))).searchParams.get("state");
  // First use: Keycloak reported an error, but the state is spent either way.
  await assert.rejects(callback(new URL(`https://c/auth/callback?state=${state}&error=access_denied`)), /Keycloak: access_denied/);
  await assert.rejects(callback(new URL(`https://c/auth/callback?state=${state}&code=x`)), /expired or was not started here/);
});

test("unfinished sign-ins are capped: the oldest state is dropped first", async () => {
  const states = [];
  for (let i = 0; i < 101; i++) states.push(new URL(login(new URL("https://c/auth/login"))).searchParams.get("state"));
  await assert.rejects(callback(new URL(`https://c/auth/callback?state=${states[0]}&code=x`)), /expired or was not started here/);
  await assert.rejects(callback(new URL(`https://c/auth/callback?state=${states[100]}&error=access_denied`)), /Keycloak: access_denied/);
});
