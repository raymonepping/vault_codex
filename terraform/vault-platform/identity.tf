# One entity per persona with an alias on the JWT mount, created before anyone
# signs in, so the internal groups (and the control-group factor) exist from
# the start.
resource "vault_identity_entity" "cast" {
  for_each = local.cast
  name     = each.key
  metadata = { persona = each.value.persona }
}

resource "vault_identity_entity_alias" "cast" {
  for_each       = local.cast
  name           = each.key
  mount_accessor = vault_jwt_auth_backend.keycloak.accessor
  canonical_id   = vault_identity_entity.cast[each.key].id
}

resource "vault_identity_group" "story" {
  for_each = local.groups
  name     = each.key
  type     = "internal"
  policies = [each.value]
  member_entity_ids = [
    for user, p in local.cast : vault_identity_entity.cast[user].id if contains(p.groups, each.key)
  ]
  metadata = { story = "The Keyholder's Codex" }
  depends_on = [
    vault_policy.seeker, vault_policy.keyholder, vault_policy.messenger,
  ]
}
