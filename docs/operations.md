# Operations

Every operation is a `make` target (`make help` prints this list). Targets
marked "(changes state)" change something; the rest only read.

## Podman

| Target | Does |
| --- | --- |
| `make check` | Verify Podman machine, compose provider, VM clock, memory and host tools |
| `make status` | Show this project's containers and network |
| `make ps` | List this project's containers |
| `make volumes` | List this project's named volumes and whether a container uses them |
| `make network` | (changes state) Create the vcdx-internal network if absent |
| `make ports-check` | Report host ports this stack wants that something else already holds |
| `make compose-config` | Validate every compose.yaml |
| `make clock-sync` | (changes state) Step the Podman VM's clock to the host's (after the Mac slept) |
| `make env-init` | (changes state) Create .env from .env.example; never overwrites |
| `make license` | (changes state) Install the Vault Enterprise licence: make license [LICENSE_FILE=path] |
| `make license-status` | Is the Vault Enterprise licence file present? (never prints it) |
| `make license-features` | Which licensed features the lab needs, and whether the cluster has them (names only) |

## TLS

| Target | Does |
| --- | --- |
| `make gen-certs` | (changes state) Create the lab CA and the shared listener certificate; idempotent |
| `make certs-reissue` | (changes state) Re-sign the listener certificate and SIGHUP running nodes |
| `make certs-status` | Show issuer, expiry and SANs of the listener certificate |
| `make trust-root` | (changes state, sudo) Trust the lab CA in the macOS System keychain so browsers accept the console |
| `make untrust-root` | (changes state, sudo) Remove the lab CA from the macOS System keychain |

## Lab: the phases of scripts/phases.txt

| Target | Does |
| --- | --- |
| `make lab` | (changes state) Every phase in order, then the gates and the convergence record; idempotent |
| `make phases` | List the phases in run order with their tool |
| `make seal-up` | (changes state) Phase 1, make: start vault-s (Shamir, Raft) |
| `make seal-init` | (changes state) Phase 2, ansible: init and unseal vault-s, seal bootstrap policies and tokens, revoke root |
| `make vault-seal` | (changes state) Phase 3, tf: Transit mount and key, token role autounseal, audit on vault-s |
| `make seal-tokens` | (changes state) Phase 4, ansible: one seal token per node from the token role |
| `make vault-up` | (changes state) Phase 5, make: vault-s up and unsealed, then vault-1..3 (auto-unseal), wait for a leader |
| `make bootstrap` | (changes state) Phase 6, ansible: init the cluster, three voters, platform bootstrap policies and tokens, revoke root |
| `make identity-up` | (changes state) Phase 7, make: start Keycloak (admin password created once in .secrets/keycloak) |
| `make cast` | (changes state) Phase 8, ansible: Keycloak realm codex, clients, the six personas and their passwords |
| `make vault-platform` | (changes state) Phase 9, tf: audit, JWT auth, identities, policies, control group, EGP, mounts, AppRole |
| `make stage` | (changes state) Phase 10, ansible: keys, ciphertexts and the manuscript (write-once per digest) |
| `make app-up` | (changes state) Phase 11, make: rotator, agent, api and web (builds if missing) |
| `make validate` | Phase 12, ansible: every persona signs in, every act's object is where it belongs |

## Gates

| Target | Does |
| --- | --- |
| `make boundary` | Each scoped token may do its own job and nothing else (sys/capabilities-self) |
| `make idempotency` | Every Ansible phase again: changed=0 (exceptions in scripts/idempotency-allow.txt) |
| `make drift` | Read-only: every Terraform plan empty, every Ansible phase changed=0 in check mode |
| `make secret-scan` | Known secret values and secret-shaped patterns in state, .build/ and logs (names only) |
| `make tf-plan-all` | Plan every Terraform root; fails if any has pending changes |
| `make layers` | Write .build/layers.json: every phase with its tool and evidence, and the gates |

## Vault

| Target | Does |
| --- | --- |
| `make unseal` | (changes state) Unseal vault-s (idempotent); the cluster then unseals itself via Transit |
| `make vault-down` | (changes state) Stop the cluster then vault-s (containers and volumes are kept) |
| `make vault-status` | Every node: container, init, seal, HA role, Raft index, version, voters |
| `make vault-stepdown` | (changes state) Ask the active node to step down; another voter takes over |
| `make vault-login` | Print the export line that points your shell at a node: make vault-login NODE=vault-1 [TOKEN=ansible-platform] |
| `make seal-token-status` | Each node's seal token: accessor fingerprint, TTL, accepted by vault-s |
| `make seal-token-rotate` | (changes state) Replace one node's seal token and recreate only that node: make seal-token-rotate NODE=vault-2 |
| `make root-regen` | (changes state) Generate a root token from the saved key, only when you ask: make root-regen CLUSTER=sealorvault |
| `make root-revoke` | (changes state) Revoke and delete a regenerated root token: make root-revoke CLUSTER=sealorvault |

## Story

| Target | Does |
| --- | --- |
| `make codex-check` | Validate config/codex.json, print its digest, write config/codex.public.json |
| `make identity-down` | (changes state) Stop Keycloak; the realm is kept |
| `make cast-copy-password` | Put a persona's password on the clipboard (never printed): make cast-copy-password U=seeker |
| `make stage-reset` | (changes state) Delete the keys and the stage, then stage again (CONFIRM=yes skips the prompt) |
| `make probe` | (changes state, scratch mounts only) Prove every act's mechanic; writes docs/capabilities.md |
| `make rehearsal` | (changes state) Every act through the API, including each way it must fail; ends with a fresh stage |
| `make show-ready` | (changes state) Five minutes before the talk: clock-sync, up, stage-reset, verify, open the console |

## App

| Target | Does |
| --- | --- |
| `make rotator-bootstrap` | (changes state) Deliver the rotator's own AppRole credential (the only one handed over); idempotent |
| `make agents-status` | Machine identity: rotator, secret-id expiry, agent health, token TTL |
| `make app-build` | (changes state) Build the api and web images: make app-build [TARGETS="api web"] |
| `make app-down` | (changes state) Stop the app stack |
| `make app-rebuild` | (changes state) Rebuild images and recreate those services: make app-rebuild [TARGETS="api web"] |
| `make open` | Print the console, API, Keycloak and Vault addresses |

## Lifecycle

| Target | Does |
| --- | --- |
| `make up` | (changes state) Daily start: clock-sync, vault-s, vault-1..3, Keycloak, app; then remove completed one-shots |
| `make down` | (changes state) Stop app, Keycloak, vault, seal; containers and volumes are kept |

## Tests

| Target | Does |
| --- | --- |
| `make verify` | End-to-end checks: podman, vault, platform, stage, app, console, boundary, drift |
| `make lint` | Static checks, as in CI: shellcheck, terraform fmt and validate, ansible syntax, node --check |
| `make test-unit` | Unit tests, no stack needed: codex-check, api, web |
| `make api-test` | Call every API route against the live stack, as each persona |
| `make e2e-install` | (changes state) Install Playwright and Chromium for the UI suite |
| `make test-ui` | Playwright: every UI journey, headless (needs make up) |
| `make test-ui-headed` | Playwright: every UI journey in a visible browser |
| `make test-ui-report` | Open the last Playwright HTML report |
| `make screenshots` | Playwright: refresh docs/screenshots (desktop + phone) |

## Maintenance

| Target | Does |
| --- | --- |
| `make doctor` | Explain what is wrong and which command fixes it (read-only) |
| `make backup` | (changes state) Raft snapshots of vault-s and the cluster, and .secrets, into `backups/<timestamp>/` |
| `make clean-slate` | (changes state) DESTRUCTIVE: remove vcdx- containers and volumes, move credentials aside (type DELETE) |

Each compose stack also has `make <stack>-logs` (`seal`, `vault`,
`identity`, `app`).

## Recovery

| Symptom | Fix |
| --- | --- |
| Anything after the Mac slept | `make up` (it starts with `make clock-sync`), then `make verify` |
| A letter expires at once, tokens "expired" | the VM clock drifted: `make clock-sync` |
| A cluster node restarts in a loop | vault-s is sealed or its seal token was revoked: `make unseal`, `make seal-token-status`, `make seal-token-rotate NODE=vault-N` |
| The console says "sign in" after a restart | sessions live in the API's memory: sign in again |
| Act II answers HTTP 409 | the Courier has not delivered a letter yet, or it expired (120s): seal a new one |
| The map is burned and the next show starts | `make stage-reset CONFIRM=yes` |
| `make lab` stopped | it printed the resume command: fix, run it, then `make lab` |
| The Archivist's token is missing | `make agents-status`, then `make rotator-bootstrap` and `make app-up` |
| A scoped token expired (unused for 32 days) | the root-regen cycle below; the tokens are minted again |
| Start again from nothing | `make backup`, then `make clean-slate` (type DELETE), then `make lab` |

## Changing a bootstrap policy (the root-regen cycle)

The bootstrap policies are written once, with the init root token, and no
tool can widen its own afterwards. A change is a deliberate act:

```bash
$EDITOR vault/policies/bootstrap/vcdx-tf-platform.hcl
make root-regen CLUSTER=vault                                  # root token in .secrets/vault/root-vault (0600)
VCDX_ROOT_FILE=.secrets/vault/root-vault scripts/ansible.sh bootstrap   # re-applies the policies; never revokes
make root-revoke CLUSTER=vault                                 # revoke and delete it
make boundary                                                  # the boundary still holds
```

`CLUSTER=seal` and `scripts/ansible.sh seal-init` for the two vault-s
policies. Vault 2.x requires a token for `sys/generate-root` as well as the
key share (HCSEC-2026-08): `root-regen.sh` sends that cluster's Ansible token,
whose bootstrap policy holds `sys/generate-root/*`. Record every use in
`docs/STATE.md`.

## Backups

`make backup` writes two Raft snapshots (vault-s and the cluster, taken with
the Ansible tokens) and a tarball of `.secrets/` to `backups/<timestamp>/`
(0700, never committed). Restore is a Raft snapshot restore on the matching
cluster with its own init material.
