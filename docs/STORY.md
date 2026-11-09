# The Keyholder's Codex

A cipher hunt in five acts and an epilogue. Every puzzle is a real Vault
Enterprise control: when an answer is wrong, a seal is broken or an approval is
missing, Vault refuses and the console shows Vault's own answer.

## The acts

| Act | Story beat | Vault feature |
| --- | --- | --- |
| Prologue: The Manuscript | An innocent ledger line hides a date | Transform FPE (FF1, Advanced Data Protection) |
| I: The Riddle | Only the right answer opens the page | Transit key with `derived=true`; the answer is the context |
| II: The Sealed Letter | The Interceptor opens it first, and the seal shows it | Response wrapping: single use, short TTL |
| III: The Council | The final secret needs 2 of 3 Keyholders | Control group + Sentinel EGP ("not yourself") |
| IV: Burning the Map | Old clues become unreadable on purpose | Transit `rotate`, `min_decryption_version`, `trim` |
| Epilogue: The Ledger | The true story, replayed | File audit devices on three nodes, `sys/audit-hash` |

## The cast (fictional)

| Persona | Who they are in Vault | Role |
| --- | --- | --- |
| The Archivist | AppRole `codex-archivist` (the API's machine identity) | Issues letters, burns the map, keeps the ledger |
| Seeker | Keycloak user `seeker` | The presenter: solves riddles, requests the cryptex |
| Courier | Keycloak user `courier` | Receives the sealed letter |
| Interceptor | Keycloak user `interceptor` | Opens what is not theirs |
| Amber, Ivory, Onyx | Keycloak users, Vault group `keyholders` | Approve the cryptex, 2 of 3 |

## What it proves, and what it only illustrates

**Proves:** context-bound decryption, single-use tamper evidence, M-of-N
approval enforced by Vault (including "not yourself"), crypto-shredding by key
version, a complete audit trail.

**Illustrates only:** one-word answers are not secrets. A dictionary cracks
them in seconds. Act I says so on screen: *"Context is not a password."*

## Spoilers

The answers below give the story away: read them after the show.

| Act | Opened by | Reveals | Answer |
| --- | --- | --- | --- |
| Prologue | decode the manuscript | 1452-04-15 and riddle P | italy |
| I | decrypt C1 with context `italy` | riddle I | red |
| II | unwrap the letter, decrypt C2 with `red` | riddle II | seven |
| III | 2 of 3 Keyholders approve, decrypt C3 with `seven` | riddle III | monday |
| IV | decrypt C4 with `monday`, then burn | the final message | none |

The final message: "The treasure was never the gold. It was knowing who
touched it."

The answers are tracked in `config/codex.json` on purpose: they are story
content, not secrets.
