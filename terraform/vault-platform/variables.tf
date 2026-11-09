variable "vault_addr" {
  description = "The cluster on a published loopback port (scripts/tf.sh)."
  type        = string
}

variable "vault_cacert" {
  description = "The lab CA chain (vault-tls/ca-chain.pem)."
  type        = string
}

variable "app_cidr" {
  description = "The vcdx-internal subnet: the Archivist's tokens are bound to it."
  type        = string
}

variable "council_ttl" {
  description = "How long a control-group request waits for the council, in seconds (D16)."
  type        = number
}

variable "keycloak_issuer" {
  description = "The issuer in the personas' tokens: Keycloak's browser-facing URL."
  type        = string
}

variable "keycloak_jwks_url" {
  description = "Where Vault fetches the realm's signing keys (inside vcdx-internal)."
  type        = string
}
