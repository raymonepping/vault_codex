#!/usr/bin/env bash
# scripts/verify.sh [section...]: end-to-end checks of the running lab.
# Read-only. Sections: podman vault platform stage app console boundary
# drift (default: all that are built). The browser-level checks are Playwright's: make test-ui.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VCDX_ROOT"

pass=0
fail=0
ok() {
  printf '  \033[32m✓\033[0m %s\n' "$*"
  pass=$((pass + 1))
}
bad() {
  printf '  \033[31m✗\033[0m %s\n' "$*"
  fail=$((fail + 1))
}
check() {
  local msg=$1
  shift
  if "$@" >/dev/null 2>&1; then ok "$msg"; else bad "$msg"; fi
}
healthy() {
  local _
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(podman container inspect "$1" --format '{{.State.Health.Status}}' 2>/dev/null)" = healthy ] && return 0
    sleep 3
  done
  return 1
}
native() { # <image>: pulled and the host's architecture, not emulated
  [ "$(podman image inspect "$1" --format '{{.Architecture}}' 2>/dev/null)" = "$(podman info --format '{{.Host.Arch}}')" ]
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

section_podman() {
  echo "podman"
  check "Podman machine answers" podman info
  check "network vcdx-internal exists" podman network exists vcdx-internal
  check "Vault Enterprise image is native arm64" native "$(vcdx_conf VAULT_ENT_IMAGE)"
  local skew=99 vm
  if vm=$(podman machine ssh date +%s 2>/dev/null | tr -d '\r' | tail -1) && [ -n "$vm" ]; then
    skew=$(($(date +%s) - vm))
    skew=${skew#-}
  fi
  check "VM clock within 5s of the Mac (${skew}s; fix: make clock-sync)" test "$skew" -le 5
}

section_vault() {
  echo "vault"
  check "listener certificate chains to the lab CA" openssl verify -CAfile vault-tls/ca-chain.pem vault-tls/vault.crt
  local node s
  for node in vault-s $VCDX_CLUSTER_NODES; do
    check "$(vault_container "$node") healthy" healthy "$(vault_container "$node")"
    vault_node "$node"
    s=$(vault_json 2>/dev/null || echo '{}')
    check "$node initialized and unsealed" jq -e '.initialized and (.sealed | not)' <<<"$s"
    check "$node runs 2.2.1+ent" jq -e '.version == "2.2.1+ent"' <<<"$s"
  done
  vault_node vault-s
  check "vault-s is Shamir-sealed" jq -e '.type == "shamir"' <<<"$(vault_json 2>/dev/null || echo '{}')"
  for node in $VCDX_CLUSTER_NODES; do
    vault_node "$node"
    check "$node is Transit-sealed" jq -e '.type == "transit"' <<<"$(vault_json 2>/dev/null || echo '{}')"
  done
  check "every node's own seal token is accepted by vault-s" ./scripts/seal-token-status.sh

  vault_cluster
  vault_token ansible-platform
  local peers leaders
  peers=$(vault operator raft list-peers -format=json 2>/dev/null || echo '{}')
  check "three Raft voters" jq -e '[.data.config.servers[] | select(.voter)] | length == 3' <<<"$peers"
  leaders=$(jq '[.data.config.servers[] | select(.leader)] | length' <<<"$peers" 2>/dev/null || echo 0)
  check "exactly one leader" test "$leaders" = 1
  check "licence autoloaded on the cluster" bash -c 'vault read -format=json sys/license/status | jq -e ".data.autoloaded.license_id != null"'
  check "licence has Transform, Control Groups and Sentinel (make license-features)" ./scripts/license-features.sh
  unset VAULT_TOKEN

  check "no root token in the seal init file" jq -e 'has("root_token") | not' .secrets/vault/seal-init.json
  check "no root token in the cluster init file" jq -e 'has("root_token") | not' .secrets/vault/vault-init.json
  check "no regenerated root token lying around (make root-revoke)" bash -c '! compgen -G ".secrets/vault/root-*" >/dev/null'
  local t
  for t in tf-seal ansible-seal tf-platform ansible-platform; do
    check "scoped token $t is 0600" test "$(stat -f '%Lp' ".secrets/vault/tokens/$t")" = 600
  done
  check "Terraform state is 0600" bash -c '! find .secrets/terraform -name "*.tfstate*" ! -perm 600 | grep . >/dev/null'
}

section_platform() {
  echo "platform"
  check "vcdx-keycloak healthy" healthy vcdx-keycloak
  check "Keycloak image is native arm64" native "$(vcdx_conf KEYCLOAK_IMAGE)"
  check "realm codex publishes its signing keys" curl -sf "http://127.0.0.1:$(vcdx_conf VCDX_PORT_KEYCLOAK)/realms/codex/protocol/openid-connect/certs"
  vault_cluster
  vault_token ansible-platform
  local m
  for m in transit/ transform/ codex/; do
    check "mount $m present" bash -c "vault read -format=json sys/mounts | jq -e '.data | has(\"$m\")'"
  done
  check "auth jwt/ and approle/ enabled" bash -c 'vault read -format=json sys/auth | jq -e ".data | has(\"jwt/\") and has(\"approle/\")"'
  check "audit device file/ enabled on the cluster" bash -c 'vault read -format=json sys/audit | jq -e ".data | has(\"file/\")"'
  check "EGP codex-council-not-yourself is hard-mandatory on the cryptex" bash -c \
    'vault read -format=json sys/policies/egp/codex-council-not-yourself | jq -e ".data.enforcement_level == \"hard-mandatory\" and (.data.paths | index(\"transit/decrypt/codex-cryptex\") != null)"'
  check "the seeker's policy holds the council's control group" bash -c \
    'vault read -format=json sys/policies/acl/codex-seeker | jq -e ".data.policy | test(\"control_group\") and test(\"keyholders\")"'
  local g want
  for g in keyholders seekers messengers; do
    want=$(jq --arg g "$g" '[.cast[] | select(.groups | index($g))] | length' config/codex.json)
    check "group $g has its $want members" bash -c "vault read -format=json identity/group/name/$g | jq -e '.data.member_entity_ids | length == $want'"
  done
  unset VAULT_TOKEN
  local u
  for u in $(jq -r '.cast[].user' config/codex.json); do
    check "$u signs in (Keycloak, then Vault jwt/) as entity $u" bash -c \
      "source scripts/common.sh; vault_cluster; persona_login $u && vault token lookup -format=json | jq -e '.data.display_name == \"jwt-$u\" and .data.entity_id != null'"
  done
}

section_stage() {
  echo "stage"
  local digest
  digest=$(node scripts/codex-check.js config/codex.json --digest)
  vault_cluster
  vault_token ansible-platform
  local k a
  for k in codex-clues codex-cryptex; do
    check "key $k exists, derived, deletable by the reset" bash -c "vault read -format=json transit/keys/$k | jq -e '.data.derived and .data.deletion_allowed'"
  done
  check "manuscript reference staged" bash -c "vault read -format=json codex/data/stage/manuscript | jq -e '.data.data.value | test(\"^[0-9]{4}-[0-9]{2}-[0-9]{2}$\")'"
  for a in act-1 act-2 act-3 act-4; do
    check "$a staged with today's digest, ciphertext only" bash -c \
      "vault read -format=json codex/data/stage/$a | jq -e '.data.data.codex_digest == \"$digest\" and (.data.data.ciphertext | startswith(\"vault:v\")) and (.data.data | has(\"plaintext\") | not)'"
  done
  unset VAULT_TOKEN
  check ".build/stage.json matches the codex" bash -c "jq -e '.codex_digest == \"$digest\"' .build/stage.json"
  check "phase validate passes (decode, act 1 with the answer and not without, Interceptor refused)" ./scripts/ansible.sh validate
}

section_app() {
  echo "app"
  local c
  for c in vcdx-rotator vcdx-vault_agent vcdx-api; do check "$c healthy" healthy "$c"; done
  check "the Archivist's identity, end to end (make agents-status)" ./scripts/agents-status.sh
  check "the agent's sink was refreshed in the last hour" bash -c "podman exec vcdx-vault_agent find /vault/secrets/token -mmin -60 | grep . >/dev/null"
  check "API health: three nodes, the Archivist's token, three audit logs readable" bash -c \
    "curl -sf http://127.0.0.1:$(vcdx_conf VCDX_PORT_API)/api/health | jq -e '(.nodes | map(select(.reachable)) | length == 3) and .archivist.tokenPresent and ([.audit[] | select(.error == null)] | length == 3)'"
  check "API image is native arm64" native "$(vcdx_conf VCDX_IMAGE_PREFIX)/api:$(vcdx_conf VCDX_IMAGE_TAG)"
  local words
  words=$(jq -r '.acts[] | (.answer // empty)' config/codex.json | paste -sd'|' -)
  check "no answer in the running API's files (/app)" bash -c "! podman exec vcdx-api grep -rliwE '$words' /app"
  check "the API holds five stage-hand credentials, not the Seeker's" bash -c \
    "curl -sf http://127.0.0.1:$(vcdx_conf VCDX_PORT_API)/api/health | jq -e '(.stagehands | length == 5) and (.stagehands | index(\"seeker\") == null)'"
}

section_console() {
  echo "console"
  local web
  web="localhost:$(vcdx_conf VCDX_PORT_WEB)"
  check "vcdx-web healthy" healthy vcdx-web
  check "web image is native arm64" native "$(vcdx_conf VCDX_IMAGE_PREFIX)/web:$(vcdx_conf VCDX_IMAGE_TAG)"
  check "TLS 1.3, chain verifies against the lab CA" bash -c "openssl s_client -connect $web -tls1_3 -servername localhost -CAfile vault-tls/ca-chain.pem -verify_return_error </dev/null 2>/dev/null | grep -F 'Verify return code: 0' >/dev/null"
  check "TLS 1.2 refused" bash -c "! openssl s_client -connect $web -tls1_2 </dev/null >/dev/null 2>&1"
  check "Content-Security-Policy without unsafe-inline scripts" bash -c "curl -sI --cacert vault-tls/ca-chain.pem https://$web/ | grep -i '^content-security-policy:' | grep -F \"script-src 'self'\" | grep -vF unsafe-inline >/dev/null"
  local p
  for p in codex prologue act-1 act-2 act-3 act-4 ledger layers; do
    check "page #/$p is served (200)" bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' --cacert vault-tls/ca-chain.pem 'https://$web/#/$p')\" = 200"
  done
  check "the console proxies the API" bash -c "curl -sf --cacert vault-tls/ca-chain.pem https://$web/api/health | jq -e .ok >/dev/null"
  check "the sign-in starts at Keycloak (PKCE)" bash -c "curl -s -o /dev/null -w '%{redirect_url}' --cacert vault-tls/ca-chain.pem https://$web/auth/login | grep -F 'code_challenge_method=S256' >/dev/null"
  check "no one-shot init container left behind" bash -c "! podman ps -a --filter name=^vcdx-volume_init --format '{{.Names}}' | grep . >/dev/null"
}

section_boundary() {
  echo "boundary"
  check "each scoped token does its own job and nothing else (make boundary)" ./scripts/boundary-check.sh
}

section_drift() {
  echo "drift"
  check "Terraform: every root plans clean (make tf-plan-all)" make -s tf-plan-all
  check "Ansible: every phase changes nothing in check mode (make drift)" ./scripts/drift.sh
}

all="podman vault platform stage app console boundary drift"
sections=${*:-$all}
for s in $sections; do
  if declare -F "section_$s" >/dev/null; then
    "section_$s"
  else
    echo "$s"
    echo "  - not built yet"
  fi
done

echo
echo "verify: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
