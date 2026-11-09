# Architecture

> **Terraform builds the house. Ansible decorates it. Vault keeps the keys.
> Make is the front door.**

## Topology

```text
network vcdx-internal                          every Vault listener: TLS 1.3, lab CA
 ├─ seal:     vault-s (Ent 2.2.1, Shamir 1/1, Raft) ── transit key autounseal
 │              token role autounseal ── one periodic orphan token per node
 ├─ vault:    vault-1, vault-2, vault-3 (Ent 2.2.1, Raft retry_join, seal "transit")
 │              audit: a file device per node, one volume per node
 │              mounts: transit/ (codex-clues, codex-cryptex), transform/, codex/ (KV v2),
 │                      jwt/ (Keycloak), approle/
 ├─ identity: keycloak (26.8.1, realm codex: six personas, two clients)
 ├─ app:      rotator ── vault-agent ──► token sink ──► api (Node 24, :13700)
 │                                                     web (nginx + React, TLS 1.3, :13701)
 ├─ Terraform: vault-seal (tf-seal) │ vault-platform (tf-platform)
 └─ Ansible:   localhost ──► the Vault and Keycloak HTTPS APIs (ansible-seal, ansible-platform)
```

Compose stacks, one project each (`vcdx-<stack>`), always through
`scripts/compose.sh`: `seal`, `vault`, `identity`, `app`. Container names keep
one dash, after the prefix (`vcdx-vault_1`); hostnames keep theirs (`vault-1`).

## Start order

vault-s must be unsealed before any cluster node starts: a Transit-sealed node
whose seal Vault does not answer exits at start. Each node reads its seal
token once, at process start (`scripts/vault-server.sh`), from a single-file
bind mount of `.secrets/vault/seal/vault-N`, written in place. `make up` and
`make vault-up` encode the order: vault-s, unseal, vault-1, vault-2,
vault-3, wait for a leader ("unsealed is not serving"), then Keycloak, then
the app. One-shot init containers are removed after a successful start.

## The phases (`scripts/phases.txt`, the only list)

| # | Tool | Phase | Does |
| --- | --- | --- | --- |
| 1 | make | `seal-up` | network, vault-s (sealed, uninitialised on a first run) |
| 2 | ansible | `seal-init` | init 1/1, unseal, write `vcdx-tf-seal` and `vcdx-ansible-seal`, mint both tokens, revoke root |
| 3 | tf | `vault-seal` | transit mount, key `autounseal`, policy, token role, audit device |
| 4 | ansible | `seal-tokens` | one seal token per node from the role (written in place) |
| 5 | make | `vault-up` | vault-s up and unsealed, vault-1..3 |
| 6 | ansible | `bootstrap` | init vault-1 (recovery 1/1), write `vcdx-tf-platform`, `vcdx-ansible-platform`, `vcdx-probe`, mint the tokens, three voters, revoke root |
| 7 | make | `identity-up` | Keycloak (admin password created once) |
| 8 | ansible | `cast` | realm `codex`, clients `codex-console` and `codex-stagehand`, six personas and their passwords |
| 9 | tf | `vault-platform` | audit, JWT auth on the realm, entities and groups, `codex-*` policies, the control group, the EGP, transit/transform/KV mounts, Transform template/transformation/role, AppRoles |
| 10 | ansible | `stage` | keys, the manuscript, four ciphertexts (write-once per digest) |
| 11 | make | `app-up` | rotator credential, rotator, agent, api, web |
| 12 | ansible | `validate` | voters, digest, six sign-ins with their policies, decode and decrypt and their refusals |

**Why the tools alternate.** Terraform can only plan what exists to talk to,
and it can only run on a token someone minted. Phase 2 is a moment (init,
unseal, the one use of the root token), phase 3 declares what that moment made
possible, phase 4 mints tokens from what phase 3 declared, and so on: each
tool picks up exactly where the other one left a precondition. Keycloak's
realm (8) must exist before Vault can trust it (9); the keys and ciphertexts
(10) are runtime state because the show rotates and trims them, so they can
never be Terraform's: `make tf-plan-all` stays empty after a full show.

## The gates (`make lab` after the phases)

| Gate | Script | Passes when |
| --- | --- | --- |
| idempotency | `scripts/idempotency.sh` | every Ansible phase again reports `changed=0` |
| drift | `scripts/drift.sh` (`TF_ONLY=1` in `make lab`) | every Terraform plan is empty (and Ansible check mode changes nothing, in `make drift`) |
| secret scan | `scripts/secret-scan.sh` | no known secret value (from `.secrets/`) and no secret-shaped pattern in state, `.build/` or the last hour of container logs |
| boundary | `scripts/boundary-check.sh` | 27 capability checks: each scoped token may do its job and nothing else |

Only then `make lab` writes `.build/convergence.json` (phases, seconds, the
automation digest over phases, Ansible, Terraform, policies and the codex,
the Vault version) and `.build/layers.json`, which the console's Layers page
shows.
