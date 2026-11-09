# STATE

What was built, deferred and learned, per prompt. When the brief
(`prompts/00_brief.md`) and the code disagree, the code wins and this file
says so.

## Decisions changed during the build

- **D11 (2026-11-09):** personas sign in through **Keycloak OIDC** (realm
  `codex`), not userpass: the user's choice before the build. The brief's D11
  and cast table are updated; prompts 04, 06 and 07 still say "userpass" in
  places and are read as Keycloak. A Keycloak stack (`compose/identity`,
  `make identity-up`, port 13702) and a phase pair `make identity-up` +
  `ansible cast` sit before `tf vault-platform`, because Vault's JWT config
  needs the realm's discovery document. The list has 12 phases, not 11.
- **Probe token (2026-11-09):** the user chose "bootstrap mints the probe
  token": `cluster_bootstrap` writes `vcdx-probe` (scratch `probe-*` paths
  only) and a 4h token before root is revoked. The user also allowed
  `make root-regen` / `make root-revoke` during the build; each use is listed
  under "Root token uses".

## Root token uses

| When (UTC) | Cluster | Why | Revoked |
| --- | --- | --- | --- |
| 2026-11-09 13:47 | vault | `vcdx-tf-platform` lacked `sudo` on `sys/mounts/auth/*/tune` (prompt 04); `make root-regen`, `VCDX_ROOT_FILE=... scripts/ansible.sh bootstrap`, `make root-revoke` | yes, same minute |
| 2026-11-09 14:05 | vault | prompt 06 keeps vault_dance's rotator: `codex-rotator` role paths for `vcdx-tf-platform`, its role-id/secret-id for `vcdx-ansible-platform`; same cycle | yes, same minute |

## Prompt 01: Foundation (2026-11-09)

Done:

- Layout, `config/defaults.conf` (images, ports, story timing),
  `.env.example`, `.gitignore` (vault_dance's, plus `.build/`, `.ref/`),
  `.gitleaks.toml`, `.containerignore`, `.editorconfig`, `.github/` from
  vault_dance.
- Removed the scaffold's root `main.tf` (an empty root next to two real ones
  confuses `make lint`), `sanity_check.md`, `FOLDER_TREE.md` and the scaffold's
  `scan_on_pr.yml` (vault_dance's `ci.yml` and `gitleaks.yml` replace it).
- `config/codex.json` + `codex.schema.json`; `scripts/codex-check.js`
  validates, rejects answers not in D9 form, prints the digest and writes
  `config/codex.public.json` (no answers, no plaintexts). The D9 rule lives
  once, in `api/lib/normalise.js`, imported by the checker. 7 unit tests.
- Wrappers from vault_dance renamed `vdnc`→`vcdx`: `common.sh` (+ `phases`,
  `info`, `die`), `compose.sh` (stacks `seal vault identity app`),
  `podman-check.sh`, `network.sh`, `ports-check.sh`, `env-init.sh`,
  `clock-sync.sh`, `gen-certs.sh` (SANs + `keycloak`, `codex.localhost`),
  `license.sh`.
- `scripts/tf.sh`: token per root, `TF_DATA_DIR` and local state in
  `.secrets/terraform/<root>/`, state forced to 0600 on exit, evidence in
  `.build/terraform/<root>.json`.
- `ansible.cfg`, `ansible/inventory.yml` (localhost only),
  `scripts/ansible.sh` (`--version-check`, `</dev/null 2>&1 | cat`, token
  dir path and lab settings in `.build/ansible-vars.json`), callback
  `vcdx_stats` (golden_ticket's `gt_stats`) writing
  `.build/ansible-stats/<playbook>[.check].json`. Collections: none beyond
  `ansible.builtin`; `ansible.posix.profile_tasks` is enabled because it is
  installed (2.2.2). No `requirements.yml`.
- `scripts/phases.txt` (12 phases, `# pending NN` until each lands),
  Makefile with every target of prompts 01 to 10 (`run` says "not built yet").
- `.claude/CLAUDE.md`, `AGENTS.md`, `docs/STORY.md` (answers under Spoilers).

Validation: `make help`, `make check` (OK), `make env-init` (kept `.env`),
`make license` (installed from `.env`), `make license-status`,
`make gen-certs`, `make certs-status`, `make ports-check` (every port free),
`make codex-check`, `node --test scripts/*.test.js` (7 pass),
`scripts/ansible.sh --version-check` (core 2.21.3).

Learned:

- `node --test scripts/` treats the directory as a file on Node 25; use
  `node --test scripts/*.test.js`.
- The scaffold's `.dockerignore` ignored `*.test.*` and `*.spec.*`;
  vault_dance's replaced it. `git check-ignore` confirms tests are tracked.

## Prompt 02: vault-s, the cluster and the tool boundary (2026-11-09)

Done:

- HCL: `vault/vault-s/config.hcl` (Shamir, Raft, TLS 1.3), `vault/vault-{1,2,3}`
  (Raft `retry_join`, `seal "transit"`, `max_lease_ttl = 2160h`, bounded
  AppRole lockout). vault_dance's plugin directory and server log file are
  gone (no plugin, the ledger reads the audit log).
- `compose/seal`, `compose/vault` from vault_dance (uid 100, `cap_drop: ALL`,
  per-node data and audit volumes, single-file seal token mount).
- Ansible: one shared role `vault_init` (vault_dance's four-case init table:
  init, unseal, bootstrap policies, scoped tokens, revoke root, strip
  `root_token`, or in the normal case check the tokens) used by both
  `seal-init.yml` and `bootstrap.yml`; `seal_tokens` (lookup by value, mint
  from the role, write **in place** through `cat` on stdin, list the node in
  `.build/seal-restart`); `cluster_bootstrap` (all nodes unsealed, three
  voters). One shared role instead of the prompt's `seal_init` +
  `cluster_bootstrap` pair: the four cases are identical for both clusters.
- The init JSON uses the CLI's field names (`unseal_keys_b64`,
  `recovery_keys_b64`) so `vault-unseal.sh` and `root-regen.sh` are unchanged.
- Bootstrap policies in `vault/policies/bootstrap/`, written complete:
  `vcdx-tf-platform` and `vcdx-ansible-platform` already carry prompt 04's
  and 05's paths (with Keycloak: JWT auth instead of userpass). `sudo` only on
  `sys/audit*` (Vault requires it), `sys/auth/<mount>` enable/tune,
  `sys/policies/egp/codex-*` (to be confirmed by the probe), `sys/step-down`.
  Every one denies writes to `sys/policies/acl/vcdx-tf-*` and `vcdx-ansible-*`.
  `vault/policies/probe.hcl` (`vcdx-probe`) and a 4h `probe` token are minted
  by bootstrap (the user's choice).
- `VCDX_ROOT_FILE=.secrets/vault/root-vault scripts/ansible.sh bootstrap`
  re-applies the bootstrap policies with a user-regenerated root token and
  never revokes it (`make root-revoke` does).
- Terraform root `terraform/vault-seal` (provider 5.13.0): transit mount,
  key `autounseal` (`deletion_allowed = false`), policy, token role
  (`token_period` in seconds), file audit device.
- Scripts: `seal-up.sh`, `vault-up.sh` (restarts listed nodes, stops at
  "answers" before the cluster is initialised), `vault-unseal.sh`,
  `vault-status.sh`, `vault-stepdown.sh`, `vault-login.sh`,
  `seal-token-status.sh`, `seal-token-rotate.sh`, `root-regen.sh` (vault_dance,
  scoped token names changed), `boundary-check.sh` (27 rows, both clusters),
  `license-features.sh`, `verify.sh` sections podman, vault, boundary, drift.

Validation (all run): seal-up, seal-init, `tf vault-seal apply`,
seal-tokens, vault-up, bootstrap; re-run of seal-init, seal-tokens and
bootstrap: `changed=0` each; `tf vault-seal plan` exit 0; `make vault-down
&& make vault-up` (leader vault-2); `make vault-stepdown` (vault-2 to
vault-1); `make seal-token-rotate NODE=vault-2` (new accessor, old revoked);
`make seal-token-status`; `make boundary` (27/27); `make license-features`;
`make verify` (36 passed, 0 failed).

Open question 1 (licence): **yes**. The licence lists `Transform Secrets
Engine`, `Control Groups` and `Sentinel` (expires 2035-12-31).

Learned:

- A first run of three nodes needs about 14s after init before autopilot
  makes all three voters; the bootstrap waits for it.
- The init response is `keys_base64` / `recovery_keys_base64` on the API; the
  CLI calls them `unseal_keys_b64` / `recovery_keys_b64`.
- `ansible.posix.profile_tasks` is noisy for a 40-task play; it is off.

## Prompt 03: the probe (2026-11-09)

Done: `scripts/probe.sh` + `scripts/probe-lib.sh` (one `api` helper,
`expect`/`row`), `terraform/probe/` (scratch root on the probe token,
applied, planned, destroyed), `ansible/probe.yml` (P25),
`vault/sentinel/codex-council-not-yourself.sentinel` (the rule the probe
proved), `docs/capabilities.md` (generated). Policy used: `vcdx-probe`
(`vault/policies/probe.hcl`), 4h token minted by bootstrap.

Validation: `make probe` twice (52 passed, 0 failed, both runs), no
`probe-*` mount or auth method left, `make verify` (36/0), `make boundary`
(27/27).

Open questions 1 to 7 (details and verbatim texts in `docs/capabilities.md`):

1. Licence: Transform Secrets Engine, Control Groups, Sentinel: present.
2. Wrong context: `cipher: message authentication failed` (400). No
   context: `missing 'context' for key derivation; ...` (400). Too old:
   `ciphertext or signature version is disallowed by policy (too old)`, also
   after trim. Used wrapping token: `wrapping token is not valid or does not
   exist` (400), for unwrap and lookup alike.
3. An approved control-group request with the wrong context unwraps to
   `cipher: message authentication failed`: the council cannot fix a wrong
   answer.
4. `length(others) > 0` (red_doors' rule) still lets a Keyholder count their
   own approval plus one other. The codex needs `length(others) >= 2`.
5. `sys/audit-hash/:path` needs `update` only, no `sudo`.
6. The node that receives a request writes the audit entry (performance
   standbys serve reads, transit and transform themselves). The ledger
   must merge all three nodes.
7. Provider 5.13.0 covers the Transform template, FPE transformation and
   role, `vault_egp_policy` and control-group ACLs: no `vault_generic_endpoint`.

Learned:

- The image has no `/vault/audit`, so a fresh named volume there is
  root-owned and uid 100 cannot open an audit file ("permission denied").
  vault-s happened to work; the cluster did not. Fixed for every audit volume
  with `driver_opts: { o: "uid=100,gid=1000" }`; the three (empty) cluster
  audit volumes were recreated.
- Vault reports an EGP denial of an **approved** control-group request as
  `Request needs further authorization` (HTTP 400), not a 403 with the EGP
  name. The console must say "the council has not approved: two Keyholders
  other than you" rather than rely on the error text.
- An EGP without `import "controlgroup"` fails with `unknown identifier
  accessed: controlgroup` and denies every request (403).
- Unwrapping a control-grouped response before approval answers `Request
  needs further authorization` (400).
- The audit log carries `auth.display_name` (`<mount>-<user>`) and
  `auth.entity_id` in clear for every unwrap: the ledger can name the
  Interceptor.

User request during this prompt (2026-11-09): container names keep one dash,
after the prefix; the service's dashes become underscores (`vcdx-vault_1`),
so Podman tools show the whole name. Compose files, `vault_container` in
`common.sh` and every script changed; the four Vault containers were
recreated (volumes kept). Recorded in `~/.claude/CLAUDE.md` and
`.claude/CLAUDE.md`.

## Prompt 04: Keycloak, the cast and the platform (2026-11-09)

Done:

- `compose/identity` (Keycloak 26.8.1, `vcdx-keycloak`, dev-file database
  on `vcdx-identity_keycloak-data`, issuer fixed to
  `http://localhost:13702`, backchannel dynamic), `entrypoint.sh` (admin
  password from `.secrets/keycloak/admin-password`), `scripts/identity-up.sh`
  (phase 7, creates that password once).
- Ansible `cast` (phase 8): realm `codex`, client `codex-console`
  (confidential, code + PKCE S256, secret in
  `.secrets/keycloak/console-client-secret`), client `codex-stagehand`
  (public, direct grants, lab only), both with an audience mapper adding
  `codex-console` to access tokens; six personas (fictional,
  `@codex.example.org`); passwords from `ansible.builtin.password` into
  `.secrets/cast/<user>` (0600); idempotent through `.build/cast/<name>.fp`
  (sha256 of the last password set). Reads run in check mode
  (`check_mode: false`), so `--check` sees the real state.
- Terraform `vault-platform` (phase 9), files by concern: `audit.tf`,
  `auth.tf` (JWT on Keycloak with `jwks_url` + `bound_issuer`, role
  `persona`, AppRole mount), `identity.tf` (entities + aliases from
  `config/codex.json`, groups `keyholders`, `seekers`, `messengers`),
  `policies.tf` + `policies/` (seeker's control group from a template:
  group, approvals and TTL from codex.json and D16), `sentinel.tf`,
  `mounts.tf` (transit, codex KV v2 `max_versions = 5`), `transform.tf`,
  `approle.tf` (`token_bound_cidrs` = the vcdx-internal subnet),
  `outputs.tf`.
- `persona_login` in `common.sh` (direct grant, then `auth/jwt/login`;
  password on curl's stdin). `scripts/cast-password.sh`.
- `verify.sh` section `platform` (mounts, auth, audit, EGP, control group,
  group sizes from codex.json, six sign-ins).
- `scripts/vault-cli.hcl`: the lab's CLI uses a token helper that returns
  nothing, so the operator's own `~/.vault-token` never reaches this lab.

Validation: `scripts/tf.sh vault-platform apply` then `plan` (exit 0);
`scripts/ansible.sh cast` twice (`changed=0`) and `--check` (`changed=0`);
`make boundary` (27/27); `make tf-plan-all`; `make verify` (55 passed after
`make clock-sync`); `make cast-copy-password U=seeker` ("copied").

The persona validation the prompt put in `cast` (lookup-self per persona)
lives in `verify platform` and in phase `validate` (prompt 05): `cast` runs
before Vault trusts Keycloak, so it cannot ask Vault yet.

Learned:

- **Vault 2.0 requires a token for `sys/generate-root`** as well as the key
  share (HCSEC-2026-08, CVE-2026-5807). vault_dance's `root-regen.sh` failed
  with 403. Both Ansible bootstrap policies now carry `sys/generate-root/*`
  and `root-regen.sh` sends that cluster's Ansible token. Because both roots
  were already revoked, nothing could add the path: the two Vault stacks
  were rebuilt from empty volumes (no story data existed yet; credentials
  moved to `.secrets/legacy/20261109T134428Z/`). Re-enabling unauthenticated
  generate-root through `enable_unauthenticated_access` was refused as a
  security weakening and not done.
- The provider reads an auth mount via `sys/mounts/auth/<path>` and tunes it
  via `sys/mounts/auth/<path>/tune`, which needs `sudo`. Both were missing
  from the first `vcdx-tf-platform`; the second needed the root-regen cycle.
- Ansible's `password` lookup file ends in a newline: strip it before use.
- The Podman VM clock drifted 57s during this prompt; `make clock-sync`.

## Prompt 05: the stage and `make lab` (2026-11-09)

Done:

- Role `codex_stage` (`ansible/stage.yml`, phase 10): keys `codex-clues`
  and `codex-cryptex` (aes256-gcm96, derived, `deletion_allowed` via
  config), the manuscript (FF1 encode) and four ciphertexts, act N with act
  N-1's answer as context (`answer | b64encode`; `codex-check.js` already
  guarantees D9 form). Records in `codex/stage/*` carry object, ciphertext,
  key, key version, digest, time; never plaintext. Fresh when every record
  carries today's digest, sits on its key's latest version and that version
  is still readable (`min_decryption_version <=` it). A stale stage reports
  one "re-stage needed" change, so check mode shows it too.
  `scripts/codex-check.js --digest` gives Ansible the digest.
  `.build/stage.json`: digest, versions, times, manuscript fingerprint.
- `ansible/stage-reset.yml` + `scripts/stage-reset.sh` (`CONFIRM=yes` or
  type RESET): prints key versions, deletes both keys and all stage
  metadata, stages again.
- `ansible/validate.yml` (phase 12): three voters, one leader, digest on
  every record, six personas sign in as their own entity with exactly their
  groups' policies (the prompt 04 persona check), the Seeker decodes and
  opens act 1 with the Prologue's answer and not with `france`, the
  Interceptor gets 403 on both. Writes `.build/gates/validation.json`.
- `scripts/lab.sh`, `idempotency.sh` (+ empty `idempotency-allow.txt`),
  `drift.sh`, `secret-scan.sh` (19 known values from `.secrets/`, three
  patterns, state + `.build/` + the last hour of every vcdx- container log),
  `layers.sh`, `automation-digest.sh` from golden_ticket. `make boundary` is
  the fourth gate.
- `verify.sh` section `stage`.

Validation: `make lab` from the running stack (rc 0, 107s, every gate
green); converged re-run (105s; phase seconds seal-up 1, seal-init 3,
vault-seal 1, seal-tokens 2, vault-up 2, bootstrap 5, identity-up 1, cast 17,
vault-platform 1, stage 6, validate 12); `scripts/ansible.sh stage --check`
(`changed=0`); `make stage-reset CONFIRM=yes && make idempotency && make
drift` (all clean); `.build/convergence.json` result `success`;
`make verify` (64 passed, 0 failed).

Learned:

- Ansible check mode **skips `uri`**, so every read the roles decide on
  (seal status, health, token lookups, Raft, Keycloak lookups, stage reads)
  carries `check_mode: false`; writes stay skipped. Without it `make drift`
  failed on seal-init, seal-tokens and bootstrap.

## Prompt 06: the API (2026-11-09)

Done:

- `api/` (Node 24, ESM, no dependencies): `lib/vault.js` (vault_dance's
  client, reshaped so every call names its token and a refusal is data, not
  an exception; always the active node), `lib/session.js` (vault_crypto's
  Keycloak code + PKCE BFF for the presenter, plus `stagehand(user)`: direct
  grant on `codex-stagehand` with that persona's own mounted password, Vault
  login cached until 60s before expiry; Bearer for scripts), `lib/story.js`
  (public codex loader that refuses a file with answers, `actorFor`: who acts
  per step, `shutReason`), `lib/said.js` (the "Vault said" block: no tokens,
  ciphertexts shortened), `lib/ledger.js` (three audit logs, incremental by
  offset, `response` entries mapped to story events; acts told apart by the
  HMAC of each staged ciphertext from `sys/audit-hash`), `lib/rate.js`
  (10 answers per minute per session), `lib/normalise.js` (prompt 01).
- `server.js`: every route of the prompt's table, plus an `attempt` block on
  intercept (the Interceptor's decrypt, 403). Replay takes the typed answer:
  the API never knows it.
- 26 unit tests (`npm test`): normalise, the answer guard (no answer or act
  plaintext anywhere under `api/` or in `codex.public.json`), said, ledger
  (synthetic entries, incremental reads, confirm), session cookie flags and
  PKCE, who acts, rate.
- `compose/app` (vault_dance): `volume-init`, `rotator` (keeps
  `codex-archivist`'s secret-id valid; its own AppRole `codex-rotator` added
  to Terraform, see "Root token uses"), `vault-agent`, `api` (five stage-hand
  password files, the console client secret, `.build/` and the three audit
  volumes, all read-only), `web` (prompt 07). `rotator-bootstrap.sh` runs
  inside `app-up.sh`.
- `scripts/api-test.sh` (35 cases, every act and its refusals, then
  `stage-reset`), `verify.sh` section `app`, `agents-status.sh`.
- Terraform: audit file mode `0640` so the API (gid 1000) reads the ledger.

Validation: `make test-unit` (7 + 26 pass), `make api-test` (35/35),
`make lab` (rc 0, 111s, app-up live, every gate green), `make verify`
(73/0), `make drift` (clean).

Deviations from the prompt:

- Cookie `SameSite=Lax`, not `Strict`: the cookie is set on Keycloak's
  redirect back (a cross-site navigation, http :13702 to https :13701); Strict
  would hide it on the first page load. Every state change is a POST, which
  Lax never sends cross-site.
- `POST /api/session` is Keycloak's own login page (`/auth/login`), D11.

Learned:

- **With the EGP in place, `sys/control-group/authorize` answers
  `approved: false` after a self-approval plus one other**: Vault applies the
  EGP when it decides "approved", not only at unwrap. The cryptex opens after
  the third Keyholder. The console words a shut cryptex from the names in
  the authorizations, since Vault's text is the same in every case.
- The secret scan flagged the rotator's role-id in Terraform state: an
  AppRole role's `role_id` is an identifier Terraform must hold; role-ids are
  no longer "known secret values", secret-ids are.

## Prompt 07: the console (2026-11-09)

Done:

- `web/` from vault_dance (React 19 + Vite 8, glass CSS, shell, hooks,
  nginx TLS 1.3 + CSP without `unsafe-inline`, Containerfile), renamed. New:
  `App.jsx` (eight pages, left and right arrows, `?`, "Vault said" drawer
  showing each `vault` block), `components/codex.jsx` (`ActHero`, `Riddle`,
  `Said`, `Refusal`, `AnswerForm`, `Attempts`, the winks), `story.js`
  (sessionStorage: texts Vault revealed, so the next hero shows the riddle
  carried), pages Codex, Prologue, Act1 to Act4, Ledger, Layers,
  `styles/codex.css` (tokens only; six motions; reduced motion honoured).
- `DESIGN.md`: the "Codex" section, pages, verification.
- `e2e/` from vault_dance: Keycloak sign-in through the real form (password
  read from `.secrets/cast/seeker` by the runner), `stage-reset` in global
  setup and teardown; `show.spec.ts` (the whole show at 1440x900 and
  390x844, keyboard), `a11y.spec.ts` (axe on eight pages at two sizes and
  signed out), `served.spec.ts` (TLS 1.3, CSP, no answer or plaintext in the
  served bundle), `screenshots.spec.ts` (`@shots`, 16 PNGs).
- `verify.sh` section `console` (TLS chain, TLS 1.2 refused, CSP, eight
  pages, API proxy, PKCE sign-in redirect, no init container left).
- API: `/api/codex` exposes the manuscript's encoded line (the audience sees
  it anyway), `/api/health` the Vault UI URL; rate limit 20 per minute (a
  rehearsal plays the show twice in a minute).
- `make app-rebuild` removes `vcdx-volume_init` afterwards (the user's rule).

Validation: `make app-rebuild && make test-unit` (7 + 26 + 3 pass),
`make test-ui` (23 passed), `make screenshots` (16 files in
`docs/screenshots/`), `make lab` (rc 0, 113s), `make verify` (89/0).

Learned:

- **The audit log keeps most refusals as a bare `invalid request`.** Vault's
  own error text (`cipher: message authentication failed`, `too old`,
  `Request needs further authorization`) reaches only the caller. The ledger
  therefore reads the story from state, in time order: an unwrap is matched
  to what it opens through the HMAC of its token (the issuing response's
  `wrap_info.token` and the unwrap's `data.token` carry the same HMAC), and a
  refused decrypt of the map after the burn is ash.
- **A failed lookup or unwrap of an already-used wrapping token is not in
  the audit log at all** (only successes appear for the Courier). The ledger
  names who opened the letter first; the broken seal is the Courier's own
  experience, shown on Act II from Vault's answer.
- An `aria-label` on a plain `span` is an axe "serious" violation
  (`aria-prohibited-attr`); the date uses a visually hidden text instead.
- Arrow-key navigation must read `location.hash`, not React state: a second
  key press can arrive before the re-render.

## Prompt 08: rehearsal, doctor and the daily cycle (2026-11-09)

Done:

- `scripts/rehearsal.sh` (`make rehearsal`): R1 to R21 as 42 rows through
  the API (HTTPS, the console's path), Vault's status and error per row. R2,
  R5 (a persona's own Vault login) and R17 (`ansible-platform`) ask Vault
  directly: no console button plays them. R9 waits on the letter's own
  `creation_time + ttl`, not a guessed sleep. Starts and ends with
  `stage-reset`; R20 is `TF_ONLY=1 drift` (the show changes the stage on
  purpose), R21 `idempotency` after the reset.
- `scripts/doctor.sh` (read-only, each finding with its fix): clock skew and
  what it breaks, disk (free GiB), images, foreign ports, vault-s sealed,
  nodes down or sealed, seal tokens rejected or under 7 days, missing scoped
  tokens, root tokens left, platform token TTLs, licence under 30 days,
  voters, stage digest and burned stage, Keycloak realm, app containers, the
  Archivist's chain, a left-behind init container, Terraform and Ansible
  drift (stage excepted).
- `scripts/up.sh` (`make up`: clock-sync, vault, identity, app, init
  containers removed; one line per step, "kept" when nothing changed),
  `make down` (app, identity, vault, seal; containers and volumes kept),
  `scripts/show-ready.sh` (clock-sync, up, stage-reset, verify, opens the
  console; `NO_OPEN=1` skips the browser), `backup.sh` (two Raft snapshots
  with the Ansible tokens + `.secrets` into `backups/<ts>/`),
  `clean-slate.sh` (vcdx- only, `CONFIRM=DELETE` or typed, moves Vault,
  Terraform, cast and Keycloak credentials to `.secrets/legacy/<ts>/`).
- `verify.sh` complete: podman, vault, platform, stage, app, console,
  boundary, drift (Terraform and Ansible check mode).
- Act II's answer field stays disabled until the Courier delivered, with a
  hint (the user hit the API's 409 by answering first).

Validation: `make rehearsal` (42/0, 205s), `make doctor` (nothing wrong
after `make clock-sync`), `make verify` (90/0), `make backup` (82 MB, in
`backups/`, ignored), `make down && make up` (41s) `&& make rehearsal`
(42/0), `NO_OPEN=1 make show-ready` (green in 100s).

Deferred to the user: the sleep test (sleep the Mac 30+ minutes, wake it,
`make show-ready`). Measured meanwhile: the VM clock drifted 57s, then 146s
within about an hour while the Mac was awake; `make clock-sync` fixed it
each time and `make show-ready` starts with it.

Learned:

- The user's rule for disk: free GiB (under 10 is a problem), not percent
  used (94% of 460 GiB still leaves 29 GiB). On macOS `df /` reports the
  sealed system volume; `$HOME`'s volume is the data volume.
- `sed 's/^./\U&/'` does not uppercase on macOS (BSD sed); bash `${a^}` does.

## Prompt 09: docs and final validation (2026-11-09)

Done:

- `README.md` (the split, the acts, proves vs illustrates, requirements with
  measured memory, first run, daily use, the presenter's run sheet, checks,
  ports, "What this lab does not do", screenshots), `docs/architecture.md`,
  `docs/ownership.md`, `docs/security-model.md`, `docs/operations.md`
  (generated from `make help`, plus recovery, the root-regen cycle, backups),
  `docs/STORY.md` final (spoilers marked in prose), `docs/capabilities.md`
  regenerated (52/0), `CHANGELOG.md` 0.1.0, `CONTRIBUTING.md`, `DESIGN.md`.
- `.claude/CLAUDE.md` and `AGENTS.md`: final commands and "What Vault 2.2.1
  actually does".
- `scripts/lint.sh`: shellcheck (52 scripts), terraform fmt and validate for
  all three roots, ansible-lint (production profile, 0 failures), node
  `--check`. CI: codex-check tests, API tests (no dependencies), console,
  lint with shellcheck and ansible-lint; actions pinned by SHA,
  `permissions: contents: read`. Dependabot: npm (web, e2e), Terraform.
  `.markdownlint.json` (line length off for tables and code).
- Published-file sweep: no em dashes (removed from the glass CSS comments,
  `.gitignore` and the `commit_gh` scaffold files `release.yml` and
  `docs/release-checklist.md`), no answer or act plaintext outside
  `config/codex.json` and `docs/STORY.md` (the probe and the checker's tests
  now use neutral words), gitleaks over the publishable files: no leaks.

Validation, from a stopped stack: `make down && make up` (71s), `make verify`
(90/0), `make doctor` (nothing wrong), `make tf-plan-all` (both empty),
`make boundary` (27/27), `make test-unit` (7 + 26 + 3), `make api-test`
(35/0), `make test-ui` (23 passed), `make rehearsal` (42/0, 210s), `make lint`
(clean). From nothing (the user allowed it): `make clean-slate` (vcdx- only,
credentials to `.secrets/legacy/20261109T154603Z/`), `make lab` (rc 0, 206s:
seal-up 0, seal-init 16, vault-seal 4, seal-tokens 5, vault-up 3, bootstrap
31, identity-up 13, cast 25, vault-platform 4, stage 11, app-up 24, validate
12), `make rehearsal` (42/0), `make verify` (90/0).

Learned:

- **bootstrap waited for vault-1 to be active.** After a restart another
  node can lead; vault-1 then answers 473 (performance standby) and the
  phase hung in check mode (`make drift`). It now waits for "serving" (200,
  429 or 473); a standby forwards the writes.
- `gitleaks dir .` reports leaks from `.secrets/` and `node_modules`; scan a
  copy of the publishable files (`git ls-files --others --exclude-standard`)
  instead.

## Prompt 10: ready for a public clone (2026-11-09)

| # | Check | Result |
| --- | --- | --- |
| R1 | no private path tracked or untracked-but-unignored | clean (`prompts/`, `input/`, `article/`, `.claude/`, `.agents/`, `.codex/`, `AGENTS.md`, `.env`, `.secrets/`, `.build/`, `backups/`, state all ignored) |
| R2 | gitleaks over the full history | no leaks (and none over the publishable files) |
| R3 | answers in `config/codex.json` on purpose | README says so; `docs/STORY.md` keeps them under "Spoilers" |
| R4 | CI beyond gitleaks | `ci.yml`: codex-check, API, console tests and build, `make lint` with shellcheck and ansible-lint; every action pinned by SHA; `permissions: contents: read` |
| R5 | Dependabot | GitHub Actions, npm (`/web`, `/e2e`), Terraform (three roots); `config/defaults.conf` says Dependabot cannot parse it |
| R6 | "What this lab does not do" | in the README |
| R7 | `LICENSE` (GPLv3), `CONTRIBUTING.md`, `CHANGELOG.md` | present and true |
| R8 | screenshots | fictional personas and lab hostnames only |

Validation: `make lint` (clean), `make test-unit` (all pass), web
`npm ci && npm test && npx vite build`, `git ls-files` (no private path),
`make verify` (90/0), `make tf-plan-all` (both empty). Not run: the CI
workflow on GitHub (nothing is committed or pushed; the user commits with
`commit_gh` when they choose).

Also: the article draft `article/01_The_Keyholders_Codex.md` (private, never
committed) with `article/STYLE.md` and six images, written on the user's
request in prompt 09.

Open for the user:

- The sleep test (prompt 08).
- `docs/release-checklist.md` and `.github/workflows/release.yml` appeared
  at 14:18 from outside this build (the `commit_gh` release scaffold); only
  their em dashes were changed.
- Nothing is committed.

## After prompt 10: Act II state (2026-11-09)

The user found Act II's answer field locked "no matter what". The page
decided "delivered" from its own memory; after a reload it forgot, while the
API still held the delivered letter. New route `GET /api/act/2/state`
(`letter`, `delivered` for this session); the page reads it on load and after
each delivery, and the hint names the next button when the seal is broken.
`make test-ui` 23 passed.
