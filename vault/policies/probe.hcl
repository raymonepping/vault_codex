# vcdx-probe: prompt 03's scratch probe (make probe). Minted by Ansible
# (bootstrap) with a 4h TTL before root is revoked, on the user's choice
# (docs/STATE.md). Everything it may touch is prefixed probe-; it is removed
# with the scratch mounts at the end of every probe run.

path "sys/mounts" { capabilities = ["read"] }
path "sys/mounts/probe-*" { capabilities = ["create", "read", "update", "delete"] }
path "probe-transit/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "probe-transform/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "probe-kv/*" { capabilities = ["create", "read", "update", "delete", "list"] }

path "sys/auth" { capabilities = ["read"] }
path "sys/auth/probe-userpass" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "auth/probe-userpass/*" { capabilities = ["create", "read", "update", "delete", "list"] }

path "sys/policies/acl/probe-*" { capabilities = ["create", "read", "update", "delete"] }
path "sys/policy/probe-*" { capabilities = ["create", "read", "update", "delete"] }
path "sys/policies/egp/probe-*" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# Identity paths are id-based, so names cannot be scoped; the probe names
# everything probe-* and deletes it.
path "identity/entity" { capabilities = ["create", "update"] }
path "identity/entity/id/*" { capabilities = ["read", "update", "delete"] }
path "identity/entity/name/probe-*" { capabilities = ["create", "read", "update", "delete"] }
path "identity/entity-alias" { capabilities = ["create", "update"] }
path "identity/entity-alias/id/*" { capabilities = ["read", "update", "delete"] }
path "identity/group" { capabilities = ["create", "update"] }
path "identity/group/id/*" { capabilities = ["read", "update", "delete"] }
path "identity/group/name/probe-*" { capabilities = ["create", "read", "update", "delete"] }
path "identity/lookup/*" { capabilities = ["update"] }

# A scratch audit device for P22/P23 (sudo: Vault requires it).
path "sys/audit" { capabilities = ["read", "sudo"] }
path "sys/audit/probe-file" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "sys/audit-hash/probe-file" { capabilities = ["update", "sudo"] }

path "sys/license/status" { capabilities = ["read"] }
path "sys/wrapping/*" { capabilities = ["update"] }
path "sys/control-group/*" { capabilities = ["update"] }
path "auth/token/create" { capabilities = ["update"] }
path "sys/storage/raft/configuration" { capabilities = ["read"] }

path "sys/policies/acl/vcdx-*" { capabilities = ["deny"] }
path "sys/policies/acl/codex-*" { capabilities = ["deny"] }
path "sys/policies/egp/codex-*" { capabilities = ["deny"] }
