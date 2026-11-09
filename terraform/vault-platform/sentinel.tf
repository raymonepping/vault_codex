# Act III's "not yourself": an endpoint-governing policy on the cryptex. The
# control-group factor alone lets a Keyholder who requests count their own
# approval (P14); this policy counts only other people (P15). It must import
# "controlgroup", or it denies every request on the path (P17).
resource "vault_egp_policy" "council" {
  name              = "codex-council-not-yourself"
  paths             = ["transit/decrypt/codex-cryptex"]
  enforcement_level = "hard-mandatory"
  policy            = file("${path.module}/../../vault/sentinel/codex-council-not-yourself.sentinel")
}
