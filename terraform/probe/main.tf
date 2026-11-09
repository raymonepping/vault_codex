# terraform/probe: prompt 03, case P24. Does provider 5.13.0 cover the
# Transform template and FPE transformation, an EGP and an ACL policy with a
# control group? Applied, planned and destroyed by make probe on the scratch
# mount probe-transform/ (which the probe creates and removes).

resource "vault_transform_template" "date" {
  path     = "probe-transform"
  name     = "probe-tf-date"
  type     = "regex"
  pattern  = "(\\d{4})-(\\d{2})-(\\d{2})"
  alphabet = "builtin/numeric"
}

resource "vault_transform_transformation" "manuscript" {
  path          = "probe-transform"
  name          = "probe-tf-ms"
  type          = "fpe"
  template      = vault_transform_template.date.name
  tweak_source  = "internal"
  allowed_roles = ["probe-tf-scribe"]
}

resource "vault_transform_role" "scribe" {
  path            = "probe-transform"
  name            = "probe-tf-scribe"
  transformations = [vault_transform_transformation.manuscript.name]
}

resource "vault_egp_policy" "council" {
  name              = "probe-tf-egp"
  paths             = ["probe-kv/data/tf"]
  enforcement_level = "hard-mandatory"
  policy            = file("${path.module}/../../vault/sentinel/codex-council-not-yourself.sentinel")
}

resource "vault_policy" "control_group" {
  name   = "probe-tf-cg"
  policy = <<-EOT
    path "probe-kv/data/tf" {
      capabilities = ["read"]
      control_group = {
        ttl = "15m"
        factor "council" {
          identity {
            group_names = ["probe-keyholders"]
            approvals   = 2
          }
        }
      }
    }
  EOT
}
