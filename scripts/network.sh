#!/bin/sh
# scripts/network.sh: create the shared network if it does not exist.
set -eu
podman network exists vcdx-internal || podman network create --label io.vcdx.project=vault_codex vcdx-internal >/dev/null
