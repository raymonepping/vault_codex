// Synthetic audit entries (shape from a 2.2.1 file device; values invented).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classify,
  confirm,
  createLedger,
  newContext,
  parseChunk,
  parseLogSpec,
  who,
} from "../lib/ledger.js";

const entry = (
  path,
  {
    error,
    auth = { display_name: "jwt-seeker" },
    data = {},
    response = {},
    time = "2026-11-09T10:00:00Z",
    id = "r1",
  } = {},
) => ({
  type: "response",
  time,
  auth,
  request: { id, path, data },
  response,
  ...(error ? { error } : {}),
});

test("who: personas, the Archivist, tool tokens", () => {
  assert.equal(who({ display_name: "jwt-interceptor" }), "interceptor");
  assert.equal(
    who({
      display_name: "approle",
      metadata: { role_name: "codex-archivist" },
    }),
    "archivist",
  );
  assert.equal(
    who({ display_name: "token-vcdx-ansible-platform" }),
    "ansible-platform",
  );
});

test("answer attempts map to their act; after the burn a refusal is ash", () => {
  const acts = { "hmac-sha256:c1": "act-1" };
  const ctx = newContext();
  const ok = classify(
    entry("transit/decrypt/codex-clues", {
      data: { ciphertext: "hmac-sha256:c1", context: "hmac-sha256:x" },
    }),
    acts,
    ctx,
  );
  assert.deepEqual([ok.act, ok.kind], ["act-1", "answer accepted"]);
  const bad = classify(
    entry("transit/decrypt/codex-clues", {
      error: "1 error occurred:\n\t* invalid request\n\n",
      data: { ciphertext: "hmac-sha256:c1" },
    }),
    acts,
    ctx,
  );
  assert.deepEqual(
    [bad.kind, bad.error],
    ["answer refused", "invalid request"],
  );
  assert.equal(
    classify(
      entry("transit/decrypt/codex-clues", {
        error: "1 error occurred: * permission denied",
      }),
      acts,
      ctx,
    ).kind,
    "decrypt not permitted",
  );
  classify(
    entry("transit/keys/codex-clues/config", {
      auth: {
        display_name: "approle",
        metadata: { role_name: "codex-archivist" },
      },
    }),
    acts,
    ctx,
  );
  assert.equal(
    classify(
      entry("transit/decrypt/codex-clues", {
        error: "invalid request",
        data: { ciphertext: "hmac-sha256:c1" },
      }),
      acts,
      ctx,
    ).kind,
    "refused: the map is ash",
  );
});

test("the letter: issued, opened, broken (matched by the token's HMAC)", () => {
  const ctx = newContext();
  const issued = classify(
    entry("codex/data/stage/act-2", {
      auth: {
        display_name: "approle",
        metadata: { role_name: "codex-archivist" },
      },
      response: { wrap_info: { token: "hmac-sha256:L1", accessor: "a" } },
    }),
    {},
    ctx,
  );
  assert.deepEqual(
    [issued.kind, issued.who],
    ["sealed letter issued", "archivist"],
  );
  assert.equal(classify(entry("codex/data/stage/act-2"), {}, ctx), null);
  const opened = classify(
    entry("sys/wrapping/unwrap", {
      auth: { display_name: "jwt-interceptor" },
      data: { token: "hmac-sha256:L1" },
    }),
    {},
    ctx,
  );
  assert.deepEqual([opened.kind, opened.who], ["letter opened", "interceptor"]);
  assert.equal(
    classify(
      entry("sys/wrapping/unwrap", {
        error: "invalid request",
        data: { token: "hmac-sha256:L1" },
      }),
      {},
      ctx,
    ).kind,
    "the seal is broken: already opened",
  );
});

test("the council: held, approved, shut, opened", () => {
  const ctx = newContext();
  assert.equal(
    classify(
      entry("transit/decrypt/codex-cryptex", {
        response: { wrap_info: { accessor: "a" } },
      }),
      {},
      ctx,
    ).kind,
    "council request held",
  );
  assert.equal(
    classify(
      entry("sys/control-group/authorize", {
        auth: { display_name: "jwt-amber" },
      }),
      {},
      ctx,
    ).who,
    "amber",
  );
  assert.equal(
    classify(
      entry("sys/wrapping/unwrap", {
        error: "invalid request",
        data: { token: "hmac-sha256:C1" },
      }),
      {},
      ctx,
    ).kind,
    "the cryptex stays shut",
  );
  assert.equal(
    classify(
      entry("sys/wrapping/unwrap", { data: { token: "hmac-sha256:C1" } }),
      {},
      ctx,
    ).kind,
    "cryptex opened",
  );
});

test("requests, foreign paths and torn lines are skipped", () => {
  assert.equal(
    classify({ ...entry("transit/decrypt/codex-clues"), type: "request" }),
    null,
  );
  assert.equal(classify(entry("sys/health")), null);
  const [out, rest] = parseChunk('{"a":1}\nnot json\n{"b":2}\n{"c":');
  assert.deepEqual(out, [{ a: 1 }, { b: 2 }]);
  assert.equal(rest, '{"c":');
});

test("confirm finds attempts by the HMAC of the guess, never the guess", () => {
  const events = [
    {
      time: "t1",
      who: "seeker",
      act: "act-1",
      kind: "answer refused",
      ok: false,
      context: "hmac-sha256:aa",
      node: "vault-1",
    },
    {
      time: "t2",
      who: "seeker",
      act: "act-1",
      kind: "answer accepted",
      ok: true,
      context: "hmac-sha256:bb",
      node: "vault-1",
    },
  ];
  assert.deepEqual(
    confirm(events, "hmac-sha256:aa").map((e) => e.time),
    ["t1"],
  );
  assert.deepEqual(confirm(events, "hmac-sha256:zz"), []);
});

test("the ledger reads all nodes incrementally, merged by time", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-"));
  const f1 = join(dir, "a.log");
  const f2 = join(dir, "b.log");
  writeFileSync(
    f1,
    `${JSON.stringify(entry("sys/control-group/authorize", { time: "2026-11-09T10:00:02Z" }))}\n`,
  );
  writeFileSync(
    f2,
    `${JSON.stringify(entry("transform/decode/codex-scribe", { time: "2026-11-09T10:00:01Z" }))}\n`,
  );
  assert.deepEqual(
    parseLogSpec(`vault-1=${f1},vault-2=${f2}`).map((x) => x.node),
    ["vault-1", "vault-2"],
  );
  const l = createLedger(`vault-1=${f1},vault-2=${f2}`);
  assert.deepEqual(
    l.events().map((e) => [e.node, e.kind]),
    [
      ["vault-2", "manuscript decoded"],
      ["vault-1", "approval"],
    ],
  );
  appendFileSync(
    f1,
    `${JSON.stringify(entry("transit/keys/codex-clues/trim", { time: "2026-11-09T10:00:03Z" }))}\n`,
  );
  assert.equal(l.events().length, 3);
  assert.equal(l.events({ since: "2026-11-09T10:00:02Z" }).length, 2);
});
