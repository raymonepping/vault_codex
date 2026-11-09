# Ownership

One owner per resource class: who creates it, how it is reset, which check
proves it.

| Resource | Owner | Created by | Reset by | Proved by |
| --- | --- | --- | --- | --- |
| Containers, networks, volumes | Compose (`scripts/compose.sh`) | `make seal-up`, `vault-up`, `identity-up`, `app-up` | `make clean-slate` (volumes) | `make verify` podman, vault, app |
| Init material, unseal and recovery keys | Ansible (`vault_init`) | phases `seal-init`, `bootstrap` | `make clean-slate` (moved aside) | `verify`: no root token in the init files |
| Bootstrap policies `vcdx-*` | Ansible (`vault_init`, root token, once) | phases `seal-init`, `bootstrap` | the root-regen cycle (`docs/operations.md`) | `make boundary` |
| Scoped tokens (four) and the 4h probe token | Ansible | phases `seal-init`, `bootstrap` | root-regen cycle | `make boundary`, `make doctor` |
| Seal Transit mount, key, policy, token role, audit | Terraform `vault-seal` | phase `vault-seal` | `scripts/tf.sh vault-seal apply` | `make tf-plan-all` |
| Seal tokens (one per node) | Ansible (`seal_tokens`) | phase `seal-tokens` | `make seal-token-rotate NODE=` | `make seal-token-status` |
| Keycloak realm, clients, personas, passwords | Ansible (`cast`) | phase `cast` | delete `.secrets/cast/<user>`, `make cast` | phase `validate`, `verify` platform |
| Audit device, auth mounts, entities, groups | Terraform `vault-platform` | phase `vault-platform` | apply | `make tf-plan-all`, `verify` platform |
| ACL policies `codex-*`, the control group, the EGP | Terraform `vault-platform` | phase `vault-platform` | apply | `verify` platform, `make rehearsal` R10 to R14 |
| Mounts `transit/`, `transform/`, `codex/`; the Transform template, transformation, role | Terraform `vault-platform` | phase `vault-platform` | apply | `verify` platform, stage |
| AppRoles `codex-archivist`, `codex-rotator` | Terraform `vault-platform` | phase `vault-platform` | apply | `make agents-status` |
| Keys `codex-clues`, `codex-cryptex` | Ansible (`codex_stage`) | phase `stage` | `make stage-reset` | `verify` stage |
| Ciphertexts and the manuscript reference | Ansible (`codex_stage`) | phase `stage` | `make stage-reset` | phase `validate`, `verify` stage |
| Key versions after a show (rotate, minimum, trim) | the API at show time (the Archivist) | Act IV | `make stage-reset` | `make rehearsal` R16, R17 |
| Wrapped letters, council requests | the API at show time | Acts II, III | expire (120s, 15 min) | `make rehearsal` R6 to R13 |
| The rotator's credential | `scripts/rotator-bootstrap.sh` (in `app-up`) | phase `app-up` | delete `.secrets/vault/rotator/`, `make app-up` | `make agents-status` |
| The Archivist's secret-id and token | the rotator and Vault Agent | continuously | restart the app | `make agents-status` |
| Certificates | `scripts/gen-certs.sh` | `make gen-certs` | `make certs-reissue` | `verify` vault, console |
