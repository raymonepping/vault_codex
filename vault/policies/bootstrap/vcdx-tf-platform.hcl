# vcdx-tf-platform: Terraform root vault-platform on the cluster (D7, prompt 04).
# Declared, plannable structure: the audit device, JWT and AppRole auth,
# entities, aliases and groups, the codex-* ACL policies (with the control
# group), the EGP, the transit/, transform/ and codex/ mounts, the Transform
# template, transformation and role, the Archivist's AppRole role.
# It may NOT use any of it: no encrypt, decrypt, encode, decode, no stage
# reads, no secret-ids, no keys (D8: keys are runtime state, Ansible's).
# Written complete in prompt 02: after root revocation nothing can widen it
# (make root-regen CLUSTER=vault is the user's deliberate act).

# ── Mounts ───────────────────────────────────────────────────────────────────
path "sys/mounts" { capabilities = ["read"] }
path "sys/mounts/transit" { capabilities = ["create", "read", "update", "delete"] }
path "sys/mounts/transform" { capabilities = ["create", "read", "update", "delete"] }
path "sys/mounts/codex" { capabilities = ["create", "read", "update", "delete"] }
path "sys/mounts/transit/tune" { capabilities = ["read", "update"] }
path "sys/mounts/transform/tune" { capabilities = ["read", "update"] }
path "sys/mounts/codex/tune" { capabilities = ["read", "update"] }
path "codex/config" { capabilities = ["create", "read", "update"] }

# ── Transform: structure only ────────────────────────────────────────────────
path "transform/alphabet/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "transform/template/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "transform/transformation/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "transform/transformations/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "transform/role/*" { capabilities = ["create", "read", "update", "delete", "list"] }

# ── Audit (sudo: Vault requires it on sys/audit/*) ───────────────────────────
path "sys/audit" { capabilities = ["read", "sudo"] }
path "sys/audit/file" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# ── Auth methods (enable/disable need sudo) ──────────────────────────────────
path "sys/auth" { capabilities = ["read"] }
path "sys/auth/jwt" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "sys/auth/approle" { capabilities = ["create", "read", "update", "delete", "sudo"] }
# The provider reads an auth mount through sys/mounts/auth/<path> (found in
# prompt 04: 403 without it).
path "sys/mounts/auth/jwt" { capabilities = ["read"] }
path "sys/mounts/auth/approle" { capabilities = ["read"] }
# Tuning an auth mount needs sudo (vault_dance learned it; prompt 04 again).
path "sys/mounts/auth/jwt/tune" { capabilities = ["read", "update", "sudo"] }
path "sys/mounts/auth/approle/tune" { capabilities = ["read", "update", "sudo"] }
path "sys/auth/jwt/tune" { capabilities = ["read", "update", "sudo"] }
path "sys/auth/approle/tune" { capabilities = ["read", "update", "sudo"] }
path "auth/jwt/config" { capabilities = ["create", "read", "update", "delete"] }
path "auth/jwt/role/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "auth/approle/role/codex-archivist" { capabilities = ["create", "read", "update", "delete"] }
path "auth/approle/role/codex-archivist/role-id" { capabilities = ["read"] }
path "auth/approle/role/codex-rotator" { capabilities = ["create", "read", "update", "delete"] }
path "auth/approle/role/codex-rotator/role-id" { capabilities = ["read"] }

# ── Identity ─────────────────────────────────────────────────────────────────
path "identity/entity" { capabilities = ["create", "update"] }
path "identity/entity/id/*" { capabilities = ["create", "read", "update", "delete"] }
path "identity/entity/name/*" { capabilities = ["create", "read", "update", "delete"] }
path "identity/entity-alias" { capabilities = ["create", "update"] }
path "identity/entity-alias/id/*" { capabilities = ["create", "read", "update", "delete"] }
path "identity/group" { capabilities = ["create", "update"] }
path "identity/group/id/*" { capabilities = ["create", "read", "update", "delete"] }
path "identity/group/name/*" { capabilities = ["create", "read", "update", "delete"] }
path "identity/lookup/entity" { capabilities = ["update"] }
path "identity/lookup/group" { capabilities = ["update"] }

# ── Policies: the story's codex-* ACLs and EGPs only ─────────────────────────
path "sys/policies/acl" { capabilities = ["list"] }
path "sys/policies/acl/codex-*" { capabilities = ["create", "read", "update", "delete"] }
path "sys/policy/codex-*" { capabilities = ["create", "read", "update", "delete"] }
path "sys/policies/egp" { capabilities = ["list"] }
path "sys/policies/egp/codex-*" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# ── The provider ─────────────────────────────────────────────────────────────
path "auth/token/create" { capabilities = ["update"] }
path "sys/license/status" { capabilities = ["read"] }

# ── Never ────────────────────────────────────────────────────────────────────
path "transit/encrypt/*" { capabilities = ["deny"] }
path "transit/decrypt/*" { capabilities = ["deny"] }
path "transit/keys/*" { capabilities = ["deny"] }
path "transform/encode/*" { capabilities = ["deny"] }
path "transform/decode/*" { capabilities = ["deny"] }
path "codex/data/*" { capabilities = ["deny"] }
path "auth/approle/role/codex-archivist/secret-id" { capabilities = ["deny"] }
path "auth/approle/role/codex-rotator/secret-id" { capabilities = ["deny"] }
path "sys/policies/acl/vcdx-tf-*" { capabilities = ["deny"] }
path "sys/policies/acl/vcdx-ansible-*" { capabilities = ["deny"] }
