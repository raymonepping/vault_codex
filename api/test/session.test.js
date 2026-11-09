import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionCookie,
  parseCookies,
  pkceChallenge,
  safeReturn,
  decodeJwt,
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
