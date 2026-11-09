import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise, context } from "../lib/normalise.js";

test("D9: NFC, trim, lowercase, then base64", () => {
  assert.equal(normalise("  Bonjour "), "bonjour");
  assert.equal(normalise("Café"), "café");
  assert.equal(context(" WORD "), Buffer.from("word").toString("base64"));
  assert.equal(normalise(undefined), "");
});

test("the same rule as scripts/codex-check.js uses (one module)", async () => {
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL("../../scripts/codex-check.js", import.meta.url),
      "utf8",
    ),
  );
  assert.match(src, /from "\.\.\/api\/lib\/normalise\.js"/);
});
