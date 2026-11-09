#!/usr/bin/env bash
# scripts/clean-slate.sh: DESTRUCTIVE. Removes this lab's containers and
# volumes (vcdx- only) and moves its Vault credentials, Terraform state, the
# cast's and Keycloak's secrets aside to .secrets/legacy/<timestamp>/. Keeps
# the lab CA, the licence and the images. Type DELETE (or CONFIRM=DELETE).
# Back up first (make backup).
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VCDX_ROOT"

answer=${CONFIRM:-}
if [ "$answer" != DELETE ]; then
  printf 'This removes every vcdx- container and volume (Vault data, audit logs, the realm) and moves credentials aside. Type DELETE: '
  read -r answer
fi
[ "$answer" = DELETE ] || {
  echo "Aborted."
  exit 1
}
for stack in app identity vault seal; do
  "$VCDX_ROOT/scripts/compose.sh" "$stack" down -v --remove-orphans 2>/dev/null || true
done
# Anything left with the prefix (one-shot containers, external volumes).
podman ps -a --filter name=^vcdx- --format '{{.Names}}' | xargs -r podman rm -f >/dev/null
podman volume ls -q --filter name=^vcdx- | xargs -r podman volume rm -f >/dev/null
podman network exists vcdx-internal && podman network rm vcdx-internal >/dev/null
legacy=".secrets/legacy/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$legacy"
for p in .secrets/vault/seal-init.json .secrets/vault/vault-init.json .secrets/vault/seal .secrets/vault/tokens \
  .secrets/vault/rotator .secrets/terraform .secrets/cast .secrets/keycloak; do
  [ -e "$p" ] && mv "$p" "$legacy/"
done
echo "clean-slate: containers, volumes and network removed; credentials moved to $legacy"
echo "clean-slate: start again with make lab"
