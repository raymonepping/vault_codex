# codex-archivist (AppRole, the API's machine identity, D12). Issues letters
# (a wrapped read of the stage), burns the map (rotate, config, trim on
# codex-clues), keeps the ledger (audit-hash: update only, proven by P22).
# Never decrypt, never authorize, never sys/policies.
path "codex/data/stage/*" {
  capabilities = ["read"]
}
path "codex/metadata/stage/*" {
  capabilities = ["read"]
}

path "transit/keys/codex-clues" {
  capabilities = ["read"]
}
path "transit/keys/codex-cryptex" {
  capabilities = ["read"]
}
path "transit/keys/codex-clues/rotate" {
  capabilities = ["update"]
}
path "transit/keys/codex-clues/config" {
  capabilities = ["update"]
}
path "transit/keys/codex-clues/trim" {
  capabilities = ["update"]
}

path "sys/wrapping/lookup" {
  capabilities = ["update"]
}
path "sys/control-group/request" {
  capabilities = ["update"]
}
path "sys/audit-hash/file" {
  capabilities = ["update"]
}
path "sys/health" {
  capabilities = ["read"]
}

path "transit/decrypt/*" {
  capabilities = ["deny"]
}
path "sys/control-group/authorize" {
  capabilities = ["deny"]
}
