#!/usr/bin/env bash
# scripts/doctor.sh (make doctor): what is wrong, and which command fixes it.
# Read-only: it never changes anything, it only tells you what to run.
set -uo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
set +e
cd "$VCDX_ROOT"

problems=0
fine() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fix() { # <problem> <command>
  printf '  \033[31m✗\033[0m %s\n      fix: %s\n' "$1" "$2"
  problems=$((problems + 1))
}
running() { [ "$(vcdx_container_state "$1")" = running ]; }
api() { # <token file> <path>: GET on the cluster, JSON or nothing
  curl -sf --cacert "$VAULT_CACERT" -H "X-Vault-Token: $(cat "$1" 2>/dev/null)" "$VAULT_ADDR/v1/$2" 2>/dev/null
}
days_left() { echo $((($(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${1%%.*}" +%s 2>/dev/null || echo 0) - $(date +%s)) / 86400)); }

echo "machine"
if podman info >/dev/null 2>&1; then fine "Podman answers"; else fix "Podman does not answer" "podman machine start (ask first: it affects every lab)"; fi
vm=$(podman machine ssh date +%s 2>/dev/null | tr -d '\r' | tail -1)
if [ -n "$vm" ]; then
  skew=$(($(date +%s) - vm))
  skew=${skew#-}
  if [ "$skew" -le 5 ]; then fine "VM clock within ${skew}s"; else fix "VM clock is ${skew}s off the Mac: letters (120s), council requests and tokens expire early or late" "make clock-sync"; fi
fi
# Free space, not percent used (the user's call: 29 GiB free on a 460 GiB
# disk is plenty). On macOS / is the sealed system volume; $HOME's is the data.
avail=$(df -g "$HOME" | awk 'NR==2 {print $4}')
[ "${avail:-0}" -ge 10 ] && fine "Mac disk: ${avail} GiB free" || fix "Mac disk: ${avail:-?} GiB free (under 10 GiB; a full disk corrupts writes in the VM)" "free space on the Mac (ask before any podman prune)"
for img in "$(vcdx_conf VAULT_ENT_IMAGE)" "$(vcdx_conf KEYCLOAK_IMAGE)" "$(vcdx_conf NODE_IMAGE)" "$(vcdx_conf NGINX_IMAGE)" "$(vcdx_conf ALPINE_IMAGE)"; do
  podman image exists "$img" || fix "image $img is missing" "make lab (compose pulls what is missing)"
done
for t in api web; do
  podman image exists "$(vcdx_conf VCDX_IMAGE_PREFIX)/$t:$(vcdx_conf VCDX_IMAGE_TAG)" || fix "image $t is not built" "make app-build"
done
busy=$("$VCDX_ROOT/scripts/ports-check.sh" 2>/dev/null | grep -vE ' free$|\(this stack\)' | awk '{print $1}' | paste -sd' ' - || true)
[ -z "$busy" ] && fine "every port is free or held by this lab" || fix "a port this lab needs is held by something else: $busy" "make ports-check, then override it in .env"

echo "vault"
[ -s .secrets/vault/vault.hclic ] || fix "no Vault Enterprise licence" "make license"
if ! running "$(vault_container vault-s)"; then
  fix "vault-s is not running: nothing can unseal or restart" "make up"
else
  vault_node vault-s
  if vault_json 2>/dev/null | jq -e '.sealed' >/dev/null; then fix "vault-s is sealed: cluster nodes cannot restart" "make unseal"; else fine "vault-s unsealed"; fi
fi
up=0
for n in $VCDX_CLUSTER_NODES; do
  if ! running "$(vault_container "$n")"; then
    fix "$n is not running" "make up"
    continue
  fi
  vault_node "$n"
  if vault_json 2>/dev/null | jq -e '.sealed | not' >/dev/null; then up=$((up + 1)); else fix "$n is sealed (its seal token, or vault-s?)" "make seal-token-status; podman logs $(vault_container "$n") | grep 403"; fi
done
[ "$up" = 3 ] && fine "three cluster nodes unsealed"
if running "$(vault_container vault-s)"; then
  vault_node vault-s
  bad=$("$VCDX_ROOT/scripts/seal-token-status.sh" 2>/dev/null | awk 'NR>1 && ($3+0 < 604800 || $5 != "accepted") {print $1}' | paste -sd' ' -)
  [ -z "$bad" ] && fine "every node's seal token accepted, more than 7 days left" || fix "seal token(s) rejected or expiring within 7 days: $bad" "make seal-token-rotate NODE=<node>"
fi
for t in tf-seal ansible-seal tf-platform ansible-platform; do
  [ -s ".secrets/vault/tokens/$t" ] || fix "scoped token $t is missing" "make lab"
done
if jq -e 'has("root_token")' .secrets/vault/seal-init.json .secrets/vault/vault-init.json 2>/dev/null | grep -F true >/dev/null; then
  fix "an init file still holds a root token (bootstrap did not finish)" "make lab"
fi
compgen -G ".secrets/vault/root-*" >/dev/null && fix "a regenerated root token is lying around" "make root-revoke CLUSTER=seal|vault"
if [ "$up" -gt 0 ]; then
  vault_cluster
  for t in tf-platform ansible-platform; do
    ttl=$(api ".secrets/vault/tokens/$t" auth/token/lookup-self | jq -r '.data.ttl // empty')
    if [ -z "$ttl" ]; then fix "the $t token is rejected (unused for 32 days?)" "make root-regen CLUSTER=vault, VCDX_ROOT_FILE=.secrets/vault/root-vault scripts/ansible.sh bootstrap, make root-revoke CLUSTER=vault"
    elif [ "$ttl" -lt 604800 ]; then fix "the $t token expires in $((ttl / 3600))h (it renews on use)" "make lab (every run renews it)"
    else fine "$t valid"; fi
  done
  lic=$(api .secrets/vault/tokens/ansible-platform sys/license/status | jq -r '.data.autoloaded.expiration_time // empty')
  if [ -n "$lic" ]; then
    d=$(days_left "$lic")
    [ "$d" -gt 30 ] && fine "licence valid for $d days" || fix "the licence expires in $d days" "renew VAULT_LICENSE in .env, then make license"
  fi
  voters=$(api .secrets/vault/tokens/ansible-platform sys/storage/raft/configuration | jq '[.data.config.servers[] | select(.voter)] | length')
  [ "${voters:-0}" = 3 ] && fine "three Raft voters" || fix "${voters:-0} Raft voters" "make vault-status; make up"
  digest=$(node scripts/codex-check.js config/codex.json --digest)
  staged=$(api .secrets/vault/tokens/ansible-platform codex/data/stage/act-1 | jq -r '.data.data.codex_digest // empty')
  if [ -z "$staged" ]; then fix "nothing is staged" "make stage"
  elif [ "$staged" != "$digest" ]; then fix "the stage does not match config/codex.json" "make stage"
  else
    k=$(api .secrets/vault/tokens/ansible-platform transit/keys/codex-clues)
    if jq -e '.data.min_decryption_version > 1 or .data.min_available_version > 0' <<<"$k" >/dev/null 2>&1; then
      fix "the map is burned (codex-clues decrypts from v$(jq -r .data.min_decryption_version <<<"$k")): Act I to IV cannot be replayed" "make stage-reset CONFIRM=yes"
    else fine "the stage matches the codex and nothing is burned"; fi
  fi
fi

echo "identity"
if running vcdx-keycloak; then
  curl -sf "http://127.0.0.1:$(vcdx_conf VCDX_PORT_KEYCLOAK)/realms/codex/protocol/openid-connect/certs" >/dev/null && fine "realm codex answers" || fix "realm codex is missing" "make cast"
else fix "Keycloak is not running" "make up"; fi

echo "app"
for c in vcdx-rotator vcdx-vault_agent vcdx-api vcdx-web; do running "$c" || fix "$c is not running" "make up"; done
if running vcdx-api; then
  "$VCDX_ROOT/scripts/agents-status.sh" >/dev/null 2>&1 && fine "the Archivist's identity chain works (rotator, secret-id, agent sink)" || fix "the Archivist's AppRole chain is broken (a lapsed secret-id or a stale sink)" "make agents-status, then make rotator-bootstrap"
fi
podman ps -a --filter name=^vcdx-volume_init --format '{{.Names}}' | grep . >/dev/null && fix "a one-shot init container was left behind" "./scripts/compose.sh app rm -f volume-init"

echo "drift"
if [ "$up" -gt 0 ]; then
  make -s tf-plan-all >/dev/null 2>&1 && fine "Terraform: every plan empty" || fix "Terraform drift" "make tf-plan-all, then make lab"
  out=$(TF_ONLY=0 "$VCDX_ROOT/scripts/drift.sh" 2>&1 | grep -E 'ansible +(DRIFT|ERROR)' | grep -v '^stage ' || true)
  [ -z "$out" ] && fine "Ansible: check mode changes nothing (stage aside: the show changes it on purpose)" || fix "Ansible drift: $out" "make lab"
fi

echo
if [ "$problems" -eq 0 ]; then echo "doctor: nothing wrong"; else echo "doctor: $problems problem(s)"; fi
[ "$problems" -eq 0 ]
