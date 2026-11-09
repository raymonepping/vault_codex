# Changelog

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
- `make probe` (52 cases), `make rehearsal` (42 cases), `make api-test`,
  `make doctor`, `make show-ready`, `make backup`, `make clean-slate`.
