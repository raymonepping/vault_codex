import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actorFor,
  keyholdersOf,
  loadCodex,
  shutReason,
  StoryError,
} from "../lib/story.js";

const codex = loadCodex(
  new URL("../../config/codex.public.json", import.meta.url),
);
const keyholders = keyholdersOf(codex);
const person = { user: "seeker" };

test("the keyholders come from the public codex", () =>
  assert.deepEqual(keyholders, ["amber", "ivory", "onyx"]));

test("fixed actors: presenter, stage hands, the Archivist", () => {
  assert.deepEqual(actorFor("act1.answer", { person }), {
    kind: "person",
    user: "seeker",
  });
  assert.deepEqual(actorFor("act2.intercept", { person }), {
    kind: "stagehand",
    user: "interceptor",
  });
  assert.deepEqual(actorFor("act2.deliver", { person }), {
    kind: "stagehand",
    user: "courier",
  });
  assert.deepEqual(actorFor("act4.burn", { person }), {
    kind: "archivist",
    user: "archivist",
  });
});

test("act III: a Keyholder may request instead of you, nobody else", () => {
  assert.deepEqual(actorFor("act3.request", { person, keyholders }), {
    kind: "person",
    user: "seeker",
  });
  assert.deepEqual(
    actorFor("act3.request", { as: "onyx", person, keyholders }),
    { kind: "stagehand", user: "onyx" },
  );
  assert.throws(
    () => actorFor("act3.request", { as: "courier", person, keyholders }),
    StoryError,
  );
});

test("act III: approvals by Keyholders, or the presenter trying; the requester opens", () => {
  assert.deepEqual(
    actorFor("act3.approve", { keyholder: "amber", person, keyholders }),
    { kind: "stagehand", user: "amber" },
  );
  assert.deepEqual(
    actorFor("act3.approve", { keyholder: "seeker", person, keyholders }),
    { kind: "person", user: "seeker" },
  );
  assert.throws(
    () =>
      actorFor("act3.approve", {
        keyholder: "interceptor",
        person,
        keyholders,
      }),
    StoryError,
  );
  assert.deepEqual(actorFor("act3.open", { person, requester: "onyx" }), {
    kind: "stagehand",
    user: "onyx",
  });
  assert.throws(() => actorFor("act3.open", { person }), /no council request/);
});

test("why the cryptex is shut", () => {
  assert.match(
    shutReason(["cipher: message authentication failed"]),
    /cannot fix a wrong answer/,
  );
  const st = {
    approved: false,
    authorizations: [{ entity_name: "onyx" }, { entity_name: "amber" }],
  };
  assert.match(
    shutReason(["Request needs further authorization"], st, "onyx"),
    /2 approvals, but one is onyx's own/,
  );
  assert.match(
    shutReason(
      ["Request needs further authorization"],
      { authorizations: [{ entity_name: "amber" }] },
      "seeker",
    ),
    /1 approval so far/,
  );
});
