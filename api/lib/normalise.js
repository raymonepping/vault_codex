// lib/normalise.js: the one answer rule (D9), shared by the API and
// scripts/codex-check.js. Unicode NFC, trim, lowercase; the Transit context
// is the base64 of the result.
export const normalise = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase();
export const context = (s) =>
  Buffer.from(normalise(s), "utf8").toString("base64");
