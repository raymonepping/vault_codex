#!/usr/bin/env bash
# scripts/app-up.sh: phase 11 (make app-up). Build images if missing, hand
# the rotator its credential, start the app stack, wait until the API answers.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"

prefix=$(vcdx_conf VCDX_IMAGE_PREFIX)
tag=$(vcdx_conf VCDX_IMAGE_TAG)
# Until a service's image can be built (web lands in prompt 07) start the rest.
services=${APP_SERVICES:-}
if [ -z "$services" ] && [ ! -f "$VCDX_ROOT/web/Containerfile" ]; then services="volume-init rotator vault-agent api"; fi
for t in api web; do
  [ -f "$VCDX_ROOT/$t/Containerfile" ] || continue
  if ! podman image exists "$prefix/$t:$tag"; then
    echo "app-up: $prefix/$t:$tag not found, building"
    "$VCDX_ROOT/scripts/app-build.sh" "$t"
  fi
done
# The rotator's own credential: the one hand-over (idempotent).
"$VCDX_ROOT/scripts/rotator-bootstrap.sh"
# shellcheck disable=SC2086
"$VCDX_ROOT/scripts/compose.sh" app up -d $services
for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$(vcdx_conf VCDX_PORT_API)/api/health" >/dev/null 2>&1 && break
  sleep 3
done
curl -sf "http://127.0.0.1:$(vcdx_conf VCDX_PORT_API)/api/health" >/dev/null || die "app-up: the API is not healthy (make app-logs, make agents-status)"
# Only reached after a successful start: one-shot init containers go (compose
# recreates them on the next up). A failed start keeps them and their logs.
"$VCDX_ROOT/scripts/compose.sh" app rm -f volume-init >/dev/null 2>&1 || true
echo "app-up: stack started, the API answers; one-shot volume-init removed"
echo "  Console: https://localhost:$(vcdx_conf VCDX_PORT_WEB)/   (lab CA; make trust-root to trust it)"
echo "  API:     http://127.0.0.1:$(vcdx_conf VCDX_PORT_API)/api/health"
