#!/usr/bin/env bash
# scripts/up.sh (make up): the daily start after the Mac slept or rebooted.
# Clock, vault-s up and unsealed, vault-1..3 (Transit auto-unseal) and a
# leader, Keycloak, the app; then the one-shot init containers go. Each step
# says what it found and what it did ("kept" when nothing had to change).
# Volumes are never touched.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VCDX_ROOT"
step() { printf '\033[1m%-12s\033[0m %s\n' "$1" "$2"; }
was() { vcdx_container_state "$1"; }

step clock-sync "$("$VCDX_ROOT/scripts/clock-sync.sh" 2>&1 | tail -1)"
before=$(was "$(vault_container vault-s)")
"$VCDX_ROOT/scripts/vault-up.sh" >"$BUILD_DIR/up-vault.log" 2>&1 || {
  cat "$BUILD_DIR/up-vault.log" >&2
  die "up: the Vault stacks did not come up (make vault-status, make vault-logs)"
}
step vault "$( [ "$before" = running ] && echo "kept: " )$(tail -1 "$BUILD_DIR/up-vault.log" | sed 's/^vault-up: //')"
before=$(was vcdx-keycloak)
"$VCDX_ROOT/scripts/identity-up.sh" >/dev/null
step identity "$( [ "$before" = running ] && echo "kept: Keycloak was running" || echo "Keycloak started ($before before)")"
before=$(was vcdx-api)
"$VCDX_ROOT/scripts/app-up.sh" >"$BUILD_DIR/up-app.log" 2>&1 || {
  cat "$BUILD_DIR/up-app.log" >&2
  die "up: the app did not come up (make app-logs, make agents-status)"
}
step app "$( [ "$before" = running ] && echo "kept: rotator, agent, api, web running" || echo "rotator, agent, api, web started ($before before)")"
step init "one-shot volume-init removed after a successful start"
echo "up: done. make verify to check, make doctor if something looks wrong, make show-ready before a talk."
