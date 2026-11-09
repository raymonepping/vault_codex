# Mounts only. The keys codex-clues and codex-cryptex, every ciphertext and
# the manuscript value are runtime state (D8): Ansible stages them, the show
# rotates and trims them, make stage-reset recreates them.
resource "vault_mount" "transit" {
  path        = "transit"
  type        = "transit"
  description = "The Archivist's inks"
}

resource "vault_mount" "codex" {
  path        = "codex"
  type        = "kv"
  options     = { version = "2" }
  description = "The stage: ciphertexts and the manuscript reference"
}

resource "vault_kv_secret_backend_v2" "codex" {
  mount        = vault_mount.codex.path
  max_versions = 5
}
