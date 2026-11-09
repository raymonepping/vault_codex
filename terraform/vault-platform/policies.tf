# The story's ACL policies (codex-*). The only one with a variable is the
# seeker's: the council's group, size and patience come from codex.json and D16.
resource "vault_policy" "seeker" {
  name = "codex-seeker"
  policy = templatefile("${path.module}/policies/codex-seeker.hcl.tftpl", {
    group     = local.council.group
    approvals = local.council.approvals
    ttl       = var.council_ttl
  })
}

resource "vault_policy" "keyholder" {
  name   = "codex-keyholder"
  policy = file("${path.module}/policies/codex-keyholder.hcl")
}

resource "vault_policy" "messenger" {
  name   = "codex-messenger"
  policy = file("${path.module}/policies/codex-messenger.hcl")
}

resource "vault_policy" "archivist" {
  name   = "codex-archivist"
  policy = file("${path.module}/policies/codex-archivist.hcl")
}
