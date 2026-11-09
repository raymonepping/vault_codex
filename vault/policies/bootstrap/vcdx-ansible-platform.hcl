# vcdx-ansible-platform: Ansible on the cluster (D7). Order and moment: the
# stage (keys, ciphertexts, the manuscript, write-once per digest), the stage
# reset, the rotator's secret-id, Raft health and snapshots, step-down, and
# the read-only checks of validate/verify. It may NOT create a mount, write
# an ACL or EGP policy, or decrypt anything (D8, D12).
# Written complete in prompt 02: after root revocation nothing can widen it.

# ── Stage: the two story keys are runtime state (D8) ─────────────────────────
path "transit/keys/codex-clues" { capabilities = ["create", "read", "update", "delete"] }
path "transit/keys/codex-cryptex" { capabilities = ["create", "read", "update", "delete"] }
path "transit/keys/codex-clues/config" { capabilities = ["update"] }
path "transit/keys/codex-cryptex/config" { capabilities = ["update"] }
path "transit/encrypt/codex-clues" { capabilities = ["update"] }
path "transit/encrypt/codex-cryptex" { capabilities = ["update"] }
path "transform/encode/codex-scribe" { capabilities = ["update"] }
path "codex/data/stage/*" { capabilities = ["create", "read", "update"] }
path "codex/metadata/stage/*" { capabilities = ["read", "delete"] }
path "codex/metadata/stage" { capabilities = ["list"] }

# ── The rotator's own credential (make rotator-bootstrap: the one hand-over) ─
path "auth/approle/role/codex-rotator/role-id" { capabilities = ["read"] }
path "auth/approle/role/codex-rotator/secret-id" { capabilities = ["update"] }
path "auth/approle/role/codex-rotator/secret-id/lookup" { capabilities = ["update"] }

# ── The Archivist's secret-id (diagnostics; the rotator keeps it valid) ──────
path "auth/approle/role/codex-archivist/role-id" { capabilities = ["read"] }
path "auth/approle/role/codex-archivist/secret-id" { capabilities = ["update", "list"] }
path "auth/approle/role/codex-archivist/secret-id-accessor/lookup" { capabilities = ["update"] }
path "auth/approle/role/codex-archivist/secret-id-accessor/destroy" { capabilities = ["update"] }

# ── Cluster operations ───────────────────────────────────────────────────────
path "sys/storage/raft/configuration" { capabilities = ["read"] }
path "sys/storage/raft/snapshot" { capabilities = ["read"] }
path "sys/step-down" { capabilities = ["update", "sudo"] }
path "sys/license/status" { capabilities = ["read"] }
path "sys/health" { capabilities = ["read"] }
path "auth/token/lookup" { capabilities = ["update"] }

# ── Read-only checks (validate, verify, doctor) ──────────────────────────────
path "sys/mounts" { capabilities = ["read"] }
path "sys/auth" { capabilities = ["read"] }
path "sys/audit" { capabilities = ["read", "sudo"] }
path "sys/policies/acl/codex-*" { capabilities = ["read"] }
path "sys/policies/egp/codex-*" { capabilities = ["read"] }
path "identity/group/name/*" { capabilities = ["read"] }
path "identity/entity/name/*" { capabilities = ["read"] }
path "auth/jwt/role/persona" { capabilities = ["read"] }
path "transform/role/codex-scribe" { capabilities = ["read"] }

# Break glass (make root-regen): Vault 2.0 requires a token as well as the
# key share for sys/generate-root (HCSEC-2026-08). root-regen.sh sends this
# token; prompt 04 found the change and added this path.
path "sys/generate-root/*" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# ── Never ────────────────────────────────────────────────────────────────────
path "transit/decrypt/*" { capabilities = ["deny"] }
path "transform/decode/*" { capabilities = ["deny"] }
path "sys/mounts/*" { capabilities = ["deny"] }
path "sys/control-group/authorize" { capabilities = ["deny"] }
path "sys/policies/acl/vcdx-tf-*" { capabilities = ["deny"] }
path "sys/policies/acl/vcdx-ansible-*" { capabilities = ["deny"] }
