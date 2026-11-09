#!/usr/bin/env bash
# scripts/cast-password.sh <user> (make cast-copy-password U=seeker): put a
# persona's Keycloak password on the clipboard. Prints "copied", never the value.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
user=${1:?Usage: make cast-copy-password U=<user>}
jq -e --arg u "$user" '.cast | map(.user) | index($u) != null' "$VCDX_ROOT/config/codex.json" >/dev/null ||
  die "cast-password: $user is not in config/codex.json"
file="$VCDX_ROOT/.secrets/cast/$user"
[ -s "$file" ] || die "cast-password: no password yet for $user: run make cast"
command -v pbcopy >/dev/null || die "cast-password: pbcopy not found (macOS only)"
tr -d '\n' <"$file" | pbcopy
echo "cast-password: $user's password copied to the clipboard"
