// lib/story.js: the acts as data and the rules for WHO acts (D11, D12).
// Pure functions, unit-tested. The API never sees an answer: it reads
// config/codex.public.json (titles, objects, the public riddle, the cast),
// and every reveal is a Vault decrypt.
import { readFileSync } from "node:fs";

export function loadCodex(
  file = process.env.CODEX_PUBLIC ||
    new URL("../config/codex.public.json", import.meta.url),
) {
  const c = JSON.parse(readFileSync(file, "utf8"));
  if (c.acts?.some((a) => "answer" in a || "plaintext" in a))
    throw new Error(
      "codex.public.json holds an answer or a plaintext: regenerate it with make codex-check",
    );
  return c;
}

export const keyholdersOf = (codex) =>
  codex.cast
    .filter((p) => p.groups.includes(codex.council.group))
    .map((p) => p.user);

// Who makes the Vault call for each step:
//   person      the signed-in presenter (their session token)
//   stagehand   a persona the presenter plays (their own login)
//   archivist   the API's machine identity (vault-agent's sink)
const FIXED = {
  "prologue.decode": "person",
  "act1.answer": "person",
  "act2.letter": "archivist",
  "act2.intercept": { stagehand: "interceptor" },
  "act2.deliver": { stagehand: "courier" },
  "act2.answer": "person",
  "act3.status": "archivist",
  "act4.answer": "person",
  "act4.burn": "archivist",
  "act4.replay": "person",
  "act4.trim": "archivist",
  "ledger.confirm": "archivist",
};

export class StoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// actorFor(step, { as, keyholder, person, keyholders, requester })
//   -> { kind: "person" | "stagehand" | "archivist", user }
export function actorFor(
  step,
  { as, keyholder, person, keyholders = [], requester } = {},
) {
  const me = person?.user || null;
  const persona = (user) =>
    user && user === me
      ? { kind: "person", user }
      : { kind: "stagehand", user };
  if (step in FIXED) {
    const f = FIXED[step];
    if (f === "person") return { kind: "person", user: me };
    if (f === "archivist") return { kind: "archivist", user: "archivist" };
    return persona(f.stagehand);
  }
  if (step === "act3.request") {
    if (!as || as === me) return { kind: "person", user: me };
    // A Keyholder may request only to show the EGP refusing a self-approval.
    if (!keyholders.includes(as))
      throw new StoryError(
        400,
        `as: only ${keyholders.join(", ")} may request instead of you`,
      );
    return persona(as);
  }
  if (step === "act3.approve") {
    if (!keyholder) throw new StoryError(400, "keyholder: who approves?");
    // Anyone may TRY (the Seeker too): Vault decides who counts.
    if (keyholder !== me && !keyholders.includes(keyholder))
      throw new StoryError(400, `keyholder: one of ${keyholders.join(", ")}`);
    return persona(keyholder);
  }
  if (step === "act3.open") {
    if (!requester)
      throw new StoryError(
        409,
        "no council request is pending: request the cryptex first",
      );
    return persona(requester);
  }
  throw new StoryError(500, `unknown step ${step}`);
}

// Why a shut cryptex is shut, in the story's words (Vault's own text stays
// beside it). With the EGP in place Vault keeps `approved` false while one of
// the approvals is the requester's own, and the unwrap says only "needs
// further authorization" (P15, api-test): the names decide the wording.
export function shutReason(errors, status, requester) {
  const e = (errors || []).join(" ");
  if (/authentication failed/.test(e))
    return "A council cannot fix a wrong answer.";
  if (/further authorization/i.test(e)) {
    const names = (status?.authorizations || []).map((a) => a.entity_name);
    if (requester && names.includes(requester))
      return `${names.length} approval${names.length === 1 ? "" : "s"}, but one is ${requester}'s own: Vault counts only Keyholders other than the one who asked.`;
    return `The council has not decided: ${names.length} approval${names.length === 1 ? "" : "s"} so far.`;
  }
  if (/not valid|does not exist/.test(e))
    return "That request is gone: ask the council again.";
  return "The cryptex stays shut.";
}
