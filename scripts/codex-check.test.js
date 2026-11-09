import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonical, digest, publicView, validate } from "./codex-check.js";
import { normalise, context } from "../api/lib/normalise.js";

const codex = JSON.parse(readFileSync(new URL("../config/codex.json", import.meta.url), "utf8"));
const clone = () => structuredClone(codex);

test("the tracked codex is valid", () => assert.deepEqual(validate(codex), []));

test("D9: NFC, trim, lowercase", () => {
  assert.equal(normalise("  Lantern "), "lantern");
  assert.equal(normalise("Itály"), normalise("Itály"));
  assert.equal(context(" COBALT "), Buffer.from("cobalt").toString("base64"));
});

test("an answer not in D9 form is rejected", () => {
  const c = clone();
  c.acts[1].answer = " Red";
  assert.match(validate(c).join("\n"), /not in D9 form/);
});

test("the last act has no answer, every other act has one", () => {
  const c = clone();
  delete c.acts[2].answer;
  c.acts[4].answer = "x";
  const e = validate(c).join("\n");
  assert.match(e, /act-2: answer is required/);
  assert.match(e, /act-4: the last act has no answer/);
});

test("the council needs more members than approvals", () => {
  const c = clone();
  c.cast = c.cast.filter((p) => p.user !== "onyx" && p.user !== "ivory");
  assert.match(validate(c).join("\n"), /council needs at least/);
});

test("digest ignores key order and formatting", () => {
  const rev = (v) => Array.isArray(v) ? v.map(rev)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, rev(x)])) : v;
  const reordered = rev(codex);
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(codex));
  assert.equal(digest(reordered), digest(codex));
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});

test("the public view holds no answer and no act plaintext", () => {
  const pub = JSON.stringify(publicView(codex));
  for (const a of codex.acts) {
    assert.ok(!pub.includes(a.plaintext), `plaintext of ${a.id} leaked`);
    if (a.answer) assert.ok(!pub.includes(`"${a.answer}"`), `answer of ${a.id} leaked`);
  }
  assert.ok(pub.includes(codex.acts[0].riddle), "the public riddle is kept");
});
