# Security model

Every identity in the lab, what it may do, and what Vault refuses it.
`make boundary` proves the tool rows; `make rehearsal` and phase `validate`
prove the persona rows.

## Tools (scoped tokens, D7)

Periodic orphan tokens (768h, renewed on every use) in
`.secrets/vault/tokens/<name>` (0600), each with one bootstrap policy from
`vault/policies/bootstrap/`. No token role mints them, so a holder cannot
mint more. Every bootstrap policy denies writes to `sys/policies/acl/vcdx-*`:
no tool rewrites its own permissions.

| Token | Vault | May | May not |
| --- | --- | --- | --- |
| `tf-seal` | vault-s | the transit mount, key `autounseal`, policy `autounseal`, the token role, the audit device (`sudo` on `sys/audit*`) | mint a seal token from the role; its own policy |
| `ansible-seal` | vault-s | mint seal tokens from the role, look up and revoke them by accessor, Raft snapshots, generate-root with the key share | change the role, the `autounseal` policy or the mount |
| `tf-platform` | cluster | audit (`sudo`), auth mounts and their tune (`sudo`), entities, aliases, groups, `codex-*` ACLs and EGPs (`sudo`), the mounts, Transform structure, both AppRole roles | encrypt, decrypt, encode, decode, read the stage, mint a secret-id, touch a key |
| `ansible-platform` | cluster | the two story keys, encrypt, encode, the stage, the rotator's credential, Raft snapshots and configuration, step-down (`sudo`), read-only checks, generate-root with the key share | decrypt or decode anything, create a mount, write an ACL or EGP, authorize a control group |
| `probe` (4h) | cluster | scratch `probe-*` mounts, auth, policies, EGPs, identity, a scratch audit device | anything named `codex-*` or `vcdx-*` |

`sudo` appears only where Vault requires it: audit devices, enabling and
tuning auth methods, EGPs, step-down, generate-root.

## Root tokens (D6)

Each init root token is used once, by Ansible, to write the bootstrap
policies and mint the scoped tokens; then it is revoked and removed from the
init file. `make verify` checks that no init file holds one and no
regenerated token is left. A bootstrap policy change is a deliberate act
(`docs/operations.md`): `make root-regen`, which on Vault 2.x needs the key
share **and** a token (HCSEC-2026-08), so it uses that cluster's Ansible token.

## The cast (personas, D11)

Six fictional personas in Keycloak realm `codex`. Vault trusts the realm
through JWT auth `jwt/` (role `persona`, `bound_audiences = codex-console`);
Terraform pre-creates the six entities with aliases, so policies come only
from Vault's internal groups.

| Persona | Groups | Policies | May | May not |
| --- | --- | --- | --- | --- |
| Seeker | seekers | `codex-seeker` | decode the manuscript, decrypt `codex-clues` with a context, request the cryptex (held by the control group), read the stage | approve; decrypt the cryptex without two Keyholders |
| Courier, Interceptor | messengers | `codex-messenger` | unwrap, look up a wrapping token | decrypt anything (the Interceptor's loot stays a ciphertext) |
| Amber, Ivory, Onyx | keyholders, seekers | `codex-keyholder`, `codex-seeker` | approve the cryptex; request it themselves | count their own approval (the EGP `codex-council-not-yourself` counts only other Keyholders) |

**The stage-hand shortcut.** One presenter plays every part, so the API holds
the passwords of the five personas the presenter plays (read-only mounts of
`.secrets/cast/<user>`) and signs each in with their own Keycloak login
(direct grant on the public, lab-only client `codex-stagehand`). Vault still
sees five distinct entities, and the console labels whose token made each
call. The Seeker's password is not in the API: the presenter signs in on
Keycloak's own page (code + PKCE, confidential client `codex-console`). In a
real deployment each person signs in themselves and `codex-stagehand` does
not exist.

## The Archivist (the API's machine identity, D12)

AppRole `codex-archivist` (token bound to the vcdx-internal subnet), its
secret-id kept valid by the rotator (AppRole `codex-rotator`, whose own
credential is the only one a human hands over: `make rotator-bootstrap`),
its token rendered by Vault Agent into a sink the API reads on every call.
It may read the stage and wrap it (a letter), rotate, configure and trim
`codex-clues` (the burn), look up wrapping tokens, read control-group status,
and `sys/audit-hash/file` (`update`, no `sudo`: proven by the probe). It is
denied every decrypt and every approval.

## The API and the console

- The API image gets `config/codex.public.json` only: no answer, no act
  plaintext (a unit test scans `api/`; a Playwright test scans the served
  bundle). Every reveal is a Vault decrypt.
- No token reaches the browser: an opaque `httpOnly`, `Secure`,
  `SameSite=Lax` cookie; tokens, wrapping tokens and the delivered letter stay
  in server memory. The "Vault said" blocks carry accessors, never tokens.
- TLS 1.3 with the lab CA; CSP without `unsafe-inline`; 20 answers per
  minute per session (stage pacing: Vault's context is the gate).

## Lab limits

Shamir 1/1 seal and recovery 1/1 on disk, local Terraform state (0600),
periodic tool tokens on disk, the stage-hand shortcut, one-word answers as
contexts ("Context is not a password"), in-memory sessions, one Mac.
