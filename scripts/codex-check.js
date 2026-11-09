#!/usr/bin/env node
// scripts/codex-check.js [config/codex.json] [--digest]
//
// Validates the clue chain, prints its digest (sha256 of the canonical JSON:
// what Ansible's stage compares, D10) and writes config/codex.public.json,
// the only story file the API gets: no answers, no act plaintexts.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalise } from "../api/lib/normalise.js";

const ACTS = ["prologue", "act-1", "act-2", "act-3", "act-4"];
const MECHANISMS = ["transform-fpe", "transit-derived", "response-wrapping", "control-group", "crypto-shred"];
const KEYS = ["codex-clues", "codex-cryptex"];

// Sorted keys at every level, so the digest ignores formatting and key order.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v).filter((k) => k !== "$schema").sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export const digest = (codex) => createHash("sha256").update(canonical(codex)).digest("hex");

export function validate(c) {
  const errors = [];
  const need = (ok, msg) => ok || errors.push(msg);
  need(c && typeof c === "object", "codex must be an object");
  if (errors.length) return errors;
  need(c.normalisation === "nfc-trim-lower", "normalisation must be nfc-trim-lower");
  need(typeof c.title === "string" && c.title, "title is required");
  need(Number.isInteger(c.council?.approvals) && c.council.approvals >= 1, "council.approvals must be an integer >= 1");
  need(typeof c.council?.group === "string", "council.group is required");
  need(Array.isArray(c.cast) && c.cast.length > 0, "cast must be a non-empty array");
  for (const p of c.cast ?? []) {
    need(/^[a-z][a-z0-9-]{1,30}$/.test(p.user ?? ""), `cast user '${p.user}' is not a valid username`);
    need(Array.isArray(p.groups), `cast ${p.user}: groups must be an array`);
  }
  const keyholders = (c.cast ?? []).filter((p) => p.groups?.includes(c.council?.group)).length;
  need(keyholders >= (c.council?.approvals ?? 0) + 1, `council needs at least approvals + 1 members (${keyholders} found), so a requester cannot be the only path`);
  need(Array.isArray(c.acts) && c.acts.length === ACTS.length, `acts must list exactly ${ACTS.join(", ")}`);
  (c.acts ?? []).forEach((a, i) => {
    const id = a.id ?? `#${i}`;
    need(a.id === ACTS[i], `act ${i} must be ${ACTS[i]} (found ${a.id})`);
    need(MECHANISMS.includes(a.mechanism), `${id}: unknown mechanism ${a.mechanism}`);
    need(typeof a.plaintext === "string" && a.plaintext.length > 0, `${id}: plaintext is required`);
    need(typeof a.object === "string" && a.object, `${id}: object is required`);
    if (i > 0) need(KEYS.includes(a.key), `${id}: key must be one of ${KEYS.join(", ")}`);
    if (i < ACTS.length - 1) {
      need(typeof a.answer === "string" && a.answer.length > 0, `${id}: answer is required`);
      if (typeof a.answer === "string")
        need(a.answer === normalise(a.answer), `${id}: answer '${a.answer}' is not in D9 form (NFC, trimmed, lowercase): use '${normalise(a.answer)}'`);
    } else need(a.answer === undefined, `${id}: the last act has no answer`);
  });
  const p = c.acts?.[0];
  if (p) {
    need(/^\d{4}-\d{2}-\d{2}$/.test(p.plaintext ?? ""), "prologue: plaintext must match NNNN-NN-NN (the FPE template)");
    need(typeof p.riddle === "string" && p.riddle, "prologue: riddle is required");
    need(p.transformation && p.role, "prologue: transformation and role are required");
  }
  return errors;
}

// What the API may know: titles, mechanisms, object names, the public riddle.
export function publicView(c) {
  return {
    title: c.title,
    final_message_title: c.final_message_title,
    council: c.council,
    cast: c.cast.map(({ user, persona, groups, story }) => ({ user, persona, groups, story })),
    acts: c.acts.map(({ id, title, mechanism, object, key, transformation, role, riddle }) =>
      Object.fromEntries(Object.entries({ id, title, mechanism, object, key, transformation, role, riddle }).filter(([, v]) => v !== undefined)),
    ),
    digest: digest(c),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const digestOnly = args.includes("--digest");
  const file = args.find((a) => !a.startsWith("--")) ?? join(dirname(fileURLToPath(import.meta.url)), "../config/codex.json");
  const codex = JSON.parse(readFileSync(file, "utf8"));
  const errors = validate(codex);
  if (errors.length) {
    for (const e of errors) console.error(`codex-check: ${e}`);
    process.exit(1);
  }
  if (digestOnly) {
    console.log(digest(codex));
    process.exit(0);
  }
  const out = join(dirname(file), "codex.public.json");
  writeFileSync(out, `${JSON.stringify(publicView(codex), null, 2)}\n`);
  console.log(`codex-check: ok, digest ${digest(codex)}, wrote ${out.replace(`${process.cwd()}/`, "")}`);
}
