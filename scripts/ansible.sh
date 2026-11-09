#!/usr/bin/env bash
# scripts/ansible.sh <playbook> [--check] [ansible-playbook args...]
# scripts/ansible.sh --version-check
#
# The only supported way to run Ansible here. Runs from the repo root with
# ansible.cfg. Ansible refuses non-blocking stdio (agent shells, some CI), so
# stdin comes from /dev/null and output goes through cat. Passes token file
# PATHS (vcdx_tokens_dir), never a token, plus the non-secret lab settings in
# .build/ansible-vars.json. The vcdx_stats callback writes the play recap
# counts to .build/ansible-stats/<playbook>[.check].json.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VCDX_ROOT"
export ANSIBLE_CONFIG="$VCDX_ROOT/ansible.cfg"

if [ "${1:-}" = --version-check ]; then
  v=$(ansible-playbook --version </dev/null 2>&1 | cat | head -1)
  echo "$v"
  [[ "$v" == *"core 2.2"[1-9]* ]] || die "ansible-core 2.21 or later is required"
  exit 0
fi

playbook=${1:?Usage: ansible.sh <playbook> [--check] [args]}
shift
playbook=${playbook%.yml}
[ -f "ansible/$playbook.yml" ] || die "ansible: unknown playbook ansible/$playbook.yml"

mkdir -p "$BUILD_DIR/ansible-stats"
jq -n \
  --arg root "$VCDX_ROOT" \
  --arg tokens "$VCDX_STATE/tokens" \
  --arg state "$VCDX_STATE" \
  --arg ca "$VAULT_CACERT" \
  --arg seal "https://127.0.0.1:$(vcdx_conf VCDX_PORT_VAULT_S)" \
  --argjson nodes "$(for n in vault-1 vault-2 vault-3; do jq -n --arg n "$n" --arg a "https://127.0.0.1:$(vault_port_of "$n")" '{($n): $a}'; done | jq -s add)" \
  --arg keycloak "http://127.0.0.1:$(vcdx_conf VCDX_PORT_KEYCLOAK)" \
  --arg web "https://localhost:$(vcdx_conf VCDX_PORT_WEB)" \
  --argjson wrap_ttl "$(vcdx_conf VCDX_WRAP_TTL)" \
  --argjson council_ttl "$(vcdx_conf VCDX_COUNCIL_TTL)" \
  --argjson session_idle "$(vcdx_conf VCDX_SESSION_IDLE)" \
  --argjson session_max "$(vcdx_conf VCDX_SESSION_MAX)" \
  '{vcdx_root: $root, vcdx_tokens_dir: $tokens, vcdx_state_dir: $state, vcdx_ca: $ca,
    vcdx_seal_addr: $seal, vcdx_node_addrs: $nodes, vcdx_cluster_addr: $nodes["vault-1"],
    vcdx_keycloak_addr: $keycloak, vcdx_web_url: $web,
    vcdx_wrap_ttl: $wrap_ttl, vcdx_council_ttl: $council_ttl,
    vcdx_session_idle: $session_idle, vcdx_session_max: $session_max}' >"$BUILD_DIR/ansible-vars.json"

# A user-run make root-regen leaves a root token file; bootstrap phases may
# use it (never revoke it: make root-revoke does) to re-apply a policy change.
if [ -n "${VCDX_ROOT_FILE:-}" ]; then
  [ -s "$VCDX_ROOT_FILE" ] || die "VCDX_ROOT_FILE=$VCDX_ROOT_FILE is not a file"
  jq --arg f "$(cd "$(dirname "$VCDX_ROOT_FILE")" && pwd)/$(basename "$VCDX_ROOT_FILE")" '. + {vcdx_root_file: $f}' \
    "$BUILD_DIR/ansible-vars.json" >"$BUILD_DIR/ansible-vars.json.tmp" && mv "$BUILD_DIR/ansible-vars.json.tmp" "$BUILD_DIR/ansible-vars.json"
fi

export VCDX_PHASE="$playbook" VCDX_STATS_DIR="$BUILD_DIR/ansible-stats"
set -o pipefail
ansible-playbook "ansible/$playbook.yml" -e "@$BUILD_DIR/ansible-vars.json" "$@" </dev/null 2>&1 | cat
