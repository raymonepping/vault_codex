# The Archivist: the API's machine identity (D12). The secret-id is runtime
# (make rotator-bootstrap mints it with ansible-platform).
resource "vault_approle_auth_backend_role" "archivist" {
  backend            = vault_auth_backend.approle.path
  role_name          = "codex-archivist"
  token_policies     = [vault_policy.archivist.name]
  token_ttl          = 3600
  token_max_ttl      = 14400
  secret_id_ttl      = 86400
  secret_id_num_uses = 0
  token_bound_cidrs  = [var.app_cidr]
}

# The rotator keeps the Archivist's secret-id valid (vault_dance's pattern).
# Its own credential is the only one a human hands over (make
# rotator-bootstrap); it never expires but works only from vcdx-internal.
resource "vault_policy" "rotator" {
  name   = "codex-rotator"
  policy = <<-EOT
    path "auth/approle/role/${vault_approle_auth_backend_role.archivist.role_name}/role-id" {
      capabilities = ["read"]
    }
    path "auth/approle/role/${vault_approle_auth_backend_role.archivist.role_name}/secret-id" {
      capabilities = ["create", "update"]
    }
    path "auth/approle/role/${vault_approle_auth_backend_role.archivist.role_name}/secret-id/lookup" {
      capabilities = ["create", "update"]
    }
    path "auth/approle/role/${vault_approle_auth_backend_role.archivist.role_name}/secret-id-accessor/destroy" {
      capabilities = ["create", "update"]
    }
  EOT
}

resource "vault_approle_auth_backend_role" "rotator" {
  backend               = vault_auth_backend.approle.path
  role_name             = "codex-rotator"
  token_policies        = [vault_policy.rotator.name]
  token_ttl             = 300
  token_max_ttl         = 600
  secret_id_ttl         = 0
  token_bound_cidrs     = [var.app_cidr]
  secret_id_bound_cidrs = [var.app_cidr]
}
