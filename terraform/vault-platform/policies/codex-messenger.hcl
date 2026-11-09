# codex-messenger (group messengers: the Courier and the Interceptor). Open a
# sealed letter and look at its seal. Nothing else, so the Interceptor's loot
# is a ciphertext they cannot read.
path "sys/wrapping/unwrap" {
  capabilities = ["update"]
}
path "sys/wrapping/lookup" {
  capabilities = ["update"]
}
