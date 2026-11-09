# codex-keyholder (group keyholders): approve the cryptex. Nothing else.
path "sys/control-group/authorize" {
  capabilities = ["update"]
}
path "sys/control-group/request" {
  capabilities = ["update"]
}
