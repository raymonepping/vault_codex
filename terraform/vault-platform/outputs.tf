output "mounts" {
  value = {
    transit   = vault_mount.transit.path
    transform = vault_mount.transform.path
    stage     = vault_mount.codex.path
    jwt       = vault_jwt_auth_backend.keycloak.path
    approle   = vault_auth_backend.approle.path
  }
}

output "groups" {
  value = { for k, g in vault_identity_group.story : k => length(g.member_entity_ids) }
}

output "policies" {
  value = [vault_policy.seeker.name, vault_policy.keyholder.name, vault_policy.messenger.name, vault_policy.archivist.name]
}

output "egp" {
  value = vault_egp_policy.council.name
}
