// Hard rule 1 (prompt 06): nothing under api/ (and nothing the image gets)
// holds an answer or an act plaintext. They reach the presenter only from a
// Vault decrypt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const codex = JSON.parse(
  readFileSync(new URL("../../config/codex.json", import.meta.url), "utf8"),
);
const secrets = [
  ...codex.acts
    .filter((a) => a.answer)
    .map((a) => ({
      what: `answer of ${a.id}`,
      re: new RegExp(`\\b${a.answer}\\b`, "i"),
    })),
  ...codex.acts.map((a) => ({
    what: `plaintext of ${a.id}`,
    re: new RegExp(a.plaintext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  })),
];

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules") return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test("no answer or act plaintext anywhere in api/", () => {
  const hits = [];
  for (const f of files(root)) {
    const text = readFileSync(f, "utf8");
    for (const s of secrets)
      if (s.re.test(text)) hits.push(`${f.replace(root, "api/")}: ${s.what}`);
  }
  assert.deepEqual(hits, []);
});

test("the public codex the image gets holds neither", () => {
  const pub = readFileSync(
    new URL("../../config/codex.public.json", import.meta.url),
    "utf8",
  );
  for (const s of secrets.filter((x) => !x.what.includes("prologue")))
    assert.ok(!s.re.test(pub), s.what);
});
