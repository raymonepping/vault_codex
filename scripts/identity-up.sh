#!/usr/bin/env bash
# scripts/identity-up.sh: phase 7 (make identity-up). Creates the Keycloak
# bootstrap admin password once (.secrets/keycloak/admin-password, 0600,
# never printed), starts Keycloak and waits until the master realm answers.
set -euo pipefail
umask 077
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
dir="$VCDX_ROOT/.secrets/keycloak"
mkdir -p "$dir"
chmod 700 "$dir"
if [ ! -s "$dir/admin-password" ]; then
  openssl rand -base64 33 | tr -d '/+=\n' >"$dir/admin-password"
  echo "identity-up: Keycloak admin password created (.secrets/keycloak/admin-password)"
fi
"$VCDX_ROOT/scripts/network.sh"
"$VCDX_ROOT/scripts/compose.sh" identity up -d keycloak >/dev/null
url="http://127.0.0.1:$(vcdx_conf VCDX_PORT_KEYCLOAK)/realms/master/.well-known/openid-configuration"
for _ in $(seq 1 60); do
  if curl -sf "$url" >/dev/null 2>&1; then
    echo "identity-up: Keycloak answers on http://localhost:$(vcdx_conf VCDX_PORT_KEYCLOAK)"
    exit 0
  fi
  sleep 3
done
die "identity-up: Keycloak did not answer within 180s (make identity-logs)"
