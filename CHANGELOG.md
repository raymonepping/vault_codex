# Changelog

## [Unreleased]

- A stage reset forgets the session's old letter and council request: after
  `make show-ready` the right answer was refused.
- POSTs from another local site (any other `https://localhost` port) are
  refused (`Sec-Fetch-Site`).
- The letter's countdown and rehearsal R9 count the TTL on the Mac's clock,
  not the drifting VM clock.
- `make show-ready` ends on a fresh stage: the ledger no longer starts with
  `verify`'s decrypts as "tried" guesses.
- `make stage-reset` rotates each node's audit log (`audit.log.1` keeps the
  previous show); the ledger reads only story events.
- `make api-test` is now `make rehearsal` (55 cases); `verify` lost seven
  duplicate page checks (83); dead UI code removed; Act II follows the API's
  letter state; a test for the sign-in callback's state check.
- The presenter stays signed in 4 hours idle (`VCDX_SESSION_IDLE`, realm and
  API alike; `cast` reconciles an existing realm); a dropped session logs why.
- A second "Burn the map" no longer rotates again; unfinished sign-ins are
  capped at 100; the API logs one JSON line per request (with Vault's request
  id) and full stacks on a 500.
- A rehearsal tab forgets what it solved when the stage changes; `make verify`
  and `make doctor` say they sign in as the cast (not during a show).
- The ledger leaves the lab's own checks out: `validate`, `make verify` and
  `make doctor` sign in through Keycloak client `codex-automation`, Vault maps
  `azp` into the token's metadata, and `/api/ledger` counts them as `hidden`.
- Console: sentence-case act labels, the Validation gate's time, no redundant
  Make pill, ledger times in tabular figures.

## 0.1.0 (2026-11-09)

First release: The Keyholder's Codex.

- vault-s (Shamir, Raft) and a three-node Vault Enterprise 2.2.1 Raft cluster
  with Transit auto-unseal, one seal token per node.
- Twelve phases in `scripts/phases.txt`, run by `make lab`: Make, Terraform
  (`vault-seal`, `vault-platform`) and Ansible (`seal-init`, `seal-tokens`,
  `bootstrap`, `cast`, `stage`, `validate`) in turn, four scoped tokens, no
  root token after bootstrap; gates idempotency, drift, secret scan,
  boundary (27 checks); `.build/convergence.json`.
- Keycloak realm `codex` with six fictional personas; Vault JWT auth,
  pre-created entities and groups.
- The five acts and the Epilogue as real Vault controls: Transform FPE,
  derived Transit keys, response wrapping, a control group with a "not
  yourself" EGP, rotate / `min_decryption_version` / trim, the merged audit
  ledger with `sys/audit-hash`.
- The Archivist (AppRole, rotator, Vault Agent), a dependency-free Node API,
  a React console in Vault daylight glass, Playwright with axe.
- `make probe` (52 cases), `make rehearsal` (`make api-test`),
  `make doctor`, `make show-ready`, `make backup`, `make clean-slate`.
