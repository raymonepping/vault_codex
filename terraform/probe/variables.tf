variable "vault_addr" {
  description = "The cluster on a published loopback port (scripts/tf.sh)."
  type        = string
}

variable "vault_cacert" {
  description = "The lab CA chain (vault-tls/ca-chain.pem)."
  type        = string
}
