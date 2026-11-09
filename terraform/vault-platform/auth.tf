# The six personas sign in through Keycloak realm codex (D11). Vault fetches
# the realm's keys over the internal network; the issuer is the browser-facing
# URL Keycloak puts in every token.
resource "vault_jwt_auth_backend" "keycloak" {
  path         = "jwt"
  type         = "jwt"
  description  = "Keycloak realm codex: the cast"
  jwks_url     = var.keycloak_jwks_url
  bound_issuer = var.keycloak_issuer
  tune {
    default_lease_ttl = "1h"
    max_lease_ttl     = "4h"
    token_type        = "default-service"
  }
}

# Policies come from the identity groups, never from the role.
resource "vault_jwt_auth_backend_role" "persona" {
  backend         = vault_jwt_auth_backend.keycloak.path
  role_name       = "persona"
  role_type       = "jwt"
  user_claim      = "preferred_username"
  bound_audiences = ["codex-console"]
  token_policies  = ["default"]
  token_ttl       = 3600
  token_max_ttl   = 14400
  # Which Keycloak client asked for the token (azp) lands in the token's
  # metadata as "client", and so in every audit entry: the ledger leaves
  # codex-automation (the lab's checks) out of the story.
  claim_mappings = {
    azp = "client"
  }
}

resource "vault_auth_backend" "approle" {
  type        = "approle"
  path        = "approle"
  description = "The Archivist (the API's machine identity)"
}
