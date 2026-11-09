# Contributing

This is a lab, built and run on one Mac. Changes are welcome as issues or
pull requests.

1. `make lab` (first run) or `make up`, then `make verify` before you change
   anything, so you know the starting point.
2. Keep to the tools' roles (`docs/architecture.md`, `docs/ownership.md`):
   declared Vault structure in Terraform, everything with an order and a
   moment in Ansible, containers through `scripts/compose.sh`, every
   operation through a `make` target. The story is data: `config/codex.json`.
3. Every container, volume and compose project starts with `vcdx-`; never
   touch another project's resources. Container names keep one dash, after
   the prefix (`vcdx-vault_1`).
4. Never print a token, key, password or the licence; show fingerprints.
   Personas are fictional. gitleaks runs in CI.
5. Before a pull request: `make lint`, `make test-unit`, `make tf-plan-all`
   (clean), `make verify`, `make rehearsal`, and for console changes
   `make test-ui` (axe must report 0 violations; see `DESIGN.md`).
6. A change to a bootstrap policy (`vault/policies/bootstrap/`) needs the
   root-regen cycle in `docs/operations.md`; nothing else can widen them.
7. No em dashes in docs, comments or UI text.
