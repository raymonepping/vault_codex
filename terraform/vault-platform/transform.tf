# The Prologue: an innocent ledger line (NNNN-NN-NN) that is really a date.
# FF1 format-preserving encryption, the tweak kept inside Vault (P2).
resource "vault_mount" "transform" {
  path        = "transform"
  type        = "transform"
  description = "The manuscript"
}

resource "vault_transform_template" "date" {
  path     = vault_mount.transform.path
  name     = "manuscript-date"
  type     = "regex"
  pattern  = "(\\d{4})-(\\d{2})-(\\d{2})"
  alphabet = "builtin/numeric"
}

resource "vault_transform_transformation" "manuscript" {
  path          = vault_mount.transform.path
  name          = "manuscript"
  type          = "fpe"
  template      = vault_transform_template.date.name
  tweak_source  = "internal"
  allowed_roles = ["codex-scribe"]
}

resource "vault_transform_role" "scribe" {
  path            = vault_mount.transform.path
  name            = "codex-scribe"
  transformations = [vault_transform_transformation.manuscript.name]
}
