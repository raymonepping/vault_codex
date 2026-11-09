locals {
  # The story as data (config/codex.json): the cast decides entities, aliases
  # and group membership; the council decides the control-group factor.
  codex   = jsondecode(file("${path.module}/../../config/codex.json"))
  cast    = { for p in local.codex.cast : p.user => p }
  council = local.codex.council
  groups = {
    keyholders = "codex-keyholder"
    seekers    = "codex-seeker"
    messengers = "codex-messenger"
  }
}
