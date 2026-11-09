#!/usr/bin/env bash
# scripts/probe.sh (make probe): prove every act's mechanic against the live
# 2.2.1 cluster before anything is built on it (prompt 03). Scratch only:
# probe-transit/, probe-transform/, probe-kv/, auth probe-userpass/, audit
# probe-file/, policies, groups and EGPs named probe-*. Created at the start,
# removed at the end, also on failure. Runs on the 4h probe token that
# bootstrap minted (vault/policies/probe.hcl). Writes docs/capabilities.md.
# Never prints a token or a password; ciphertexts are shortened.
set -euo pipefail
umask 077
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
# shellcheck source=scripts/probe-lib.sh
source "$VCDX_ROOT/scripts/probe-lib.sh"
cd "$VCDX_ROOT"

OUT="$VCDX_ROOT/docs/capabilities.md"
ROWS=$(mktemp)
PW_DIR=$(mktemp -d)
NOTES=$(mktemp)
pass=0
fail=0
T=$(cat "$VCDX_STATE/tokens/probe" 2>/dev/null) || die "probe: no probe token (.secrets/vault/tokens/probe); bootstrap mints one, make root-regen re-mints"
vault_active
api "$T" GET auth/token/lookup-self
[ "$ST" = 200 ] || die "probe: the probe token is not accepted (expired after 4h?): HTTP $ST $ERR"
note() { printf -- '- %s\n' "$*" >>"$NOTES"; }
ENTITIES="$BUILD_DIR/probe-entities"

cleanup() {
  set +e
  PROBE_ADDR="" vault_active >/dev/null 2>&1
  for e in $(cat "$ENTITIES" 2>/dev/null); do api "$T" DELETE "identity/entity/id/$e"; done
  rm -f "$ENTITIES"
  api "$T" DELETE identity/group/name/probe-keyholders
  for p in probe-not-yourself probe-no-import probe-tf-egp; do api "$T" DELETE "sys/policies/egp/$p"; done
  for p in probe-seeker probe-keyholder probe-messenger probe-scribe probe-hash probe-hash-sudo probe-tf-cg; do api "$T" DELETE "sys/policies/acl/$p"; done
  api "$T" DELETE sys/auth/probe-userpass
  for m in probe-transit probe-transform probe-kv; do api "$T" DELETE "sys/mounts/$m"; done
  api "$T" DELETE sys/audit/probe-file
  rm -f "$ROWS.tf"
  set -e
}
trap 'cleanup; rm -rf "$ROWS" "$NOTES" "$PW_DIR"' EXIT
echo "probe: removing leftovers of an earlier run"
cleanup

started=$(date +%s)
echo "probe: scratch mounts, auth, audit, personas"
api "$T" POST sys/mounts/probe-transit '{"type":"transit"}'
api "$T" POST sys/mounts/probe-transform '{"type":"transform"}'
api "$T" POST sys/mounts/probe-kv '{"type":"kv","options":{"version":"2"}}'
api "$T" POST sys/auth/probe-userpass '{"type":"userpass"}'
api "$T" PUT sys/audit/probe-file '{"type":"file","options":{"file_path":"/vault/audit/probe.log","mode":"0600"}}'
[ "$ST" = 204 ] || die "probe: could not enable the scratch audit device: HTTP $ST $ERR"

# Personas: the same shape as the story (prompt 04), probe-prefixed.
api "$T" PUT sys/policies/acl/probe-seeker "$(jq -n '{policy: "
path \"probe-transit/decrypt/probe-clues\" { capabilities = [\"update\"] }
path \"probe-transform/decode/probe-scribe\" { capabilities = [\"update\"] }
path \"probe-transit/decrypt/probe-cryptex\" {
  capabilities = [\"update\"]
  control_group = {
    ttl = \"15m\"
    factor \"council\" {
      identity { group_names = [\"probe-keyholders\"] approvals = 2 }
    }
  }
}
path \"probe-transit/decrypt/probe-other\" { capabilities = [\"update\"] }
path \"sys/control-group/request\" { capabilities = [\"update\"] }
"}')"
api "$T" PUT sys/policies/acl/probe-keyholder "$(jq -n '{policy: "
path \"sys/control-group/authorize\" { capabilities = [\"update\"] }
path \"sys/control-group/request\" { capabilities = [\"update\"] }
"}')"
api "$T" PUT sys/policies/acl/probe-messenger "$(jq -n '{policy: "path \"sys/wrapping/lookup\" { capabilities = [\"update\"] }"}')"
api "$T" PUT sys/policies/acl/probe-hash "$(jq -n '{policy: "path \"sys/audit-hash/probe-file\" { capabilities = [\"update\"] }"}')"
api "$T" PUT sys/policies/acl/probe-hash-sudo "$(jq -n '{policy: "path \"sys/audit-hash/probe-file\" { capabilities = [\"update\", \"sudo\"] }"}')"
declare -A POL=([seeker]=probe-seeker [courier]=probe-messenger [interceptor]=probe-messenger
  [amber]="probe-keyholder,probe-seeker" [ivory]=probe-keyholder [onyx]="probe-keyholder,probe-seeker"
  [hash]=probe-hash [hashsudo]=probe-hash-sudo)
declare -A TOK ENT
for u in "${!POL[@]}"; do
  openssl rand -hex 24 >"$PW_DIR/$u"
  api "$T" POST "auth/probe-userpass/users/$u" "$(jq -n --arg p "$(cat "$PW_DIR/$u")" --arg pol "${POL[$u]}" '{password: $p, token_policies: $pol}')"
  login "$u"
  [ -n "${ENT[$u]}" ] && [ "${ENT[$u]}" != null ] || die "probe: no entity for $u"
  echo "${ENT[$u]}" >>"$ENTITIES"
done
api "$T" POST identity/group "$(jq -n --arg a "${ENT[amber]}" --arg i "${ENT[ivory]}" --arg o "${ENT[onyx]}" \
  '{name: "probe-keyholders", type: "internal", member_entity_ids: [$a, $i, $o]}')"

# ── P1 ────────────────────────────────────────────────────────────────────────
echo "Licence"
api "$T" GET sys/license/status
features=$(jq -r '.data.autoloaded.features | join(", ")' <<<"$BODY")
for f in "Transform Secrets Engine" "Control Groups" "Sentinel"; do
  ERR=""; expect P1 all "sys/license/status has $f" present 200 ".data.autoloaded.features | index(\"$f\") != null"
done

# ── Prologue ──────────────────────────────────────────────────────────────────
echo "Prologue: Transform FPE"
api "$T" POST probe-transform/template/probe-date '{"type":"regex","pattern":"(\\d{4})-(\\d{2})-(\\d{2})","alphabet":"builtin/numeric"}'
api "$T" POST probe-transform/transformations/fpe/probe-ms '{"template":"probe-date","tweak_source":"internal","allowed_roles":["probe-scribe"]}'
api "$T" POST probe-transform/role/probe-scribe '{"transformations":["probe-ms"]}'
api "$T" POST probe-transform/encode/probe-scribe '{"value":"1503-10-21","transformation":"probe-ms"}'
enc=$(jq -r '.data.encoded_value // empty' <<<"$BODY")
api "$T" POST probe-transform/encode/probe-scribe '{"value":"1503-10-21","transformation":"probe-ms"}'
enc2=$(jq -r '.data.encoded_value // empty' <<<"$BODY")
[[ "$enc" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$enc" == "$enc2" ]] && r=yes || r=no
row P2 Prologue "transform/encode (FF1, tweak internal)" "same format, deterministic" "encoded $enc (twice the same: $([ "$enc" = "$enc2" ] && echo yes || echo no))" $r
api "${TOK[seeker]}" POST probe-transform/decode/probe-scribe "$(jq -n --arg v "$enc" '{value: $v, transformation: "probe-ms"}')"
expect P2 Prologue "transform/decode as the seeker" "1503-10-21" 200 '.data.decoded_value == "1503-10-21"'
api "$T" GET probe-transform/transformations/fpe/probe-ms
note "P2: the FPE transformation reads back as $(jq -c '.data | {type, template: .templates, tweak_source, allowed_roles}' <<<"$BODY" 2>/dev/null)"
api "${TOK[courier]}" POST probe-transform/decode/probe-scribe "$(jq -n --arg v "$enc" '{value: $v, transformation: "probe-ms"}')"
expect P3 Prologue "transform/decode without the role path" "403" 403

# ── Act I ─────────────────────────────────────────────────────────────────────
echo "Act I: derived Transit key, the answer is the context"
api "$T" POST probe-transit/keys/probe-clues '{"derived":true,"deletion_allowed":true}'
plain=$(b64 "riddle one")
api "$T" POST probe-transit/encrypt/probe-clues "$(jq -n --arg p "$plain" --arg c "$(b64 lantern)" '{plaintext: $p, context: $c}')"
C1=$(jq -r '.data.ciphertext // empty' <<<"$BODY")
P4_REQ=$(jq -r '.request_id' <<<"$BODY")
row P4 I "transit/encrypt context=b64(lantern)" "vault:v1:" "$(short "$C1")" "$([[ "$C1" == vault:v1:* ]] && echo yes || echo no)"
api "${TOK[seeker]}" POST probe-transit/decrypt/probe-clues "$(jq -n --arg c "$C1" --arg x "$(b64 france)" '{ciphertext: $c, context: $x}')"
expect P5 I "decrypt context=b64(france)" "refused, Vault's text" "400|500"
P5_ERR=$ERR
api "${TOK[seeker]}" POST probe-transit/decrypt/probe-clues "$(jq -n --arg c "$C1" '{ciphertext: $c}')"
expect P6 I "decrypt without context" "refused, Vault's text" "400"
P6_ERR=$ERR
norm=$(node -e 'import("./api/lib/normalise.js").then(m => process.stdout.write(m.context(process.argv[1])))' "  Lantern ")
api "${TOK[seeker]}" POST probe-transit/decrypt/probe-clues "$(jq -n --arg c "$C1" --arg x "$norm" '{ciphertext: $c, context: $x}')"
expect P7 I "decrypt context=normalise(\"  Lantern \")" "plaintext" 200 ".data.plaintext == \"$plain\""

# ── Act II ────────────────────────────────────────────────────────────────────
echo "Act II: response wrapping"
api "$T" POST probe-kv/data/letter "$(jq -n --arg c "$C1" '{data: {ciphertext: $c}}')"
api "$T" GET probe-kv/data/letter "" "X-Vault-Wrap-TTL: 120"
W=$(jq -r '.wrap_info.token // empty' <<<"$BODY")
api "${TOK[interceptor]}" POST sys/wrapping/lookup "$(jq -n --arg t "$W" '{token: $t}')"
expect P9 II "sys/wrapping/lookup on a live token" "creation_path, creation_time, creation_ttl" 200 '.data.creation_path == "probe-kv/data/letter" and .data.creation_ttl == 120'
api "${TOK[interceptor]}" POST sys/wrapping/unwrap "$(jq -n --arg t "$W" '{token: $t}')"
expect P8 II "unwrap as identity A (the Interceptor)" "succeeds, ciphertext only" 200 '.data.data.ciphertext | startswith("vault:v1:")'
api "${TOK[courier]}" POST sys/wrapping/unwrap "$(jq -n --arg t "$W" '{token: $t}')"
expect P8 II "unwrap again as identity B (the Courier)" "fails, Vault's text" "400"
P8_ERR=$ERR
api "${TOK[courier]}" POST sys/wrapping/lookup "$(jq -n --arg t "$W" '{token: $t}')"
expect P9 II "sys/wrapping/lookup on a used token" "error" "400"
P9_ERR=$ERR
api "${TOK[interceptor]}" POST probe-transit/decrypt/probe-clues "$(jq -n --arg c "$C1" --arg x "$(b64 lantern)" '{ciphertext: $c, context: $x}')"
expect P8 II "the Interceptor decrypts the loot" "403 (policy)" 403

# ── Act III ───────────────────────────────────────────────────────────────────
echo "Act III: control group, 2 of 3 Keyholders"
api "$T" POST probe-transit/keys/probe-cryptex '{"derived":true,"deletion_allowed":true}'
api "$T" POST probe-transit/encrypt/probe-cryptex "$(jq -n --arg p "$(b64 'riddle three')" --arg c "$(b64 cobalt)" '{plaintext: $p, context: $c}')"
C3=$(jq -r '.data.ciphertext' <<<"$BODY")
cg_request() { # <user> <context word>: sets CG_TOKEN, CG_ACC
  api "${TOK[$1]}" POST probe-transit/decrypt/probe-cryptex "$(jq -n --arg c "$C3" --arg x "$(b64 "$2")" '{ciphertext: $c, context: $x}')"
  CG_TOKEN=$(jq -r '.wrap_info.token // empty' <<<"$BODY")
  CG_ACC=$(jq -r '.wrap_info.accessor // empty' <<<"$BODY")
}
authorize() { api "${TOK[$1]}" POST sys/control-group/authorize "$(jq -n --arg a "$CG_ACC" '{accessor: $a}')"; }
unwrap() { api "${TOK[$1]}" POST sys/wrapping/unwrap "$(jq -n --arg t "$CG_TOKEN" '{token: $t}')"; }

cg_request seeker cobalt
expect P11 III "seeker decrypts probe-cryptex (outside the group)" "wrap_info, not data" 200 '.wrap_info.token != null and .data == null'
api "${TOK[seeker]}" POST sys/control-group/request "$(jq -n --arg a "$CG_ACC" '{accessor: $a}')"
expect P11 III "sys/control-group/request" "approved=false" 200 '.data.approved == false and (.data.request_path | test("probe-cryptex"))'
note "P11: the request status has keys $(jq -c '.data | keys' <<<"$BODY")"
authorize amber
expect P12 III "first approval (amber)" "accepted" 200 '.data.approved == false'
unwrap seeker
expect P12 III "unwrap after one approval" "refused, Vault's text" "400|403"
P12_ERR=$ERR
authorize ivory
expect P13 III "second approval (ivory)" "approved" 200 '.data.approved == true'
unwrap seeker
expect P13 III "unwrap after two approvals" "plaintext" 200 ".data.plaintext == \"$(b64 'riddle three')\""
api "${TOK[seeker]}" POST sys/control-group/authorize "$(jq -n --arg a "x" '{accessor: $a}')"
expect P13 III "the seeker approves (not a Keyholder)" "403" 403

cg_request onyx cobalt
authorize onyx
authorize amber
expect P14 III "onyx requests, onyx + amber approve" "approved=true (no EGP yet)" 200 '.data.approved == true'
unwrap onyx
expect P14 III "onyx unwraps after self + one approval, no EGP" "opens (red_doors' finding)" 200 ".data.plaintext == \"$(b64 'riddle three')\""

egp_put() { # <name> <file or text> <path>
  api "$T" PUT "sys/policies/egp/$1" "$(jq -n --arg p "$2" --arg path "$3" '{policy: $p, enforcement_level: "hard-mandatory", paths: [$path]}')"
}
rule_gt0=$(sed 's/length(others) >= 2/length(others) > 0/' vault/sentinel/codex-council-not-yourself.sentinel)
egp_put probe-not-yourself "$rule_gt0" probe-transit/decrypt/probe-cryptex
expect P15 III "EGP with import, rule length(others) > 0" "written" "200|204"
cg_request onyx cobalt
authorize onyx
authorize amber
unwrap onyx
expect P15 III "onyx self + amber, rule > 0" "opens: amber is one other person" 200
egp_put probe-not-yourself "$(cat vault/sentinel/codex-council-not-yourself.sentinel)" probe-transit/decrypt/probe-cryptex
cg_request onyx cobalt
authorize onyx
authorize amber
unwrap onyx
expect P15 III "onyx self + amber, rule >= 2 (the codex rule)" "refused by the EGP" "400|403"
P15_ERR=$ERR
cg_request onyx cobalt
authorize onyx
authorize amber
authorize ivory
unwrap onyx
expect P15 III "onyx self + amber + ivory, rule >= 2" "opens: two other people" 200 ".data.plaintext == \"$(b64 'riddle three')\""
cg_request seeker cobalt
expect P15 III "seeker requests with the EGP in place (no authorizations yet)" "wrap_info (the EGP lets the request through)" 200 '.wrap_info.token != null'
authorize amber
authorize ivory
unwrap seeker
expect P15 III "seeker + amber + ivory with the EGP" "opens" 200 ".data.plaintext == \"$(b64 'riddle three')\""

cg_request seeker france
authorize amber
authorize ivory
unwrap seeker
expect P16 III "approved request with the WRONG context" "the council cannot fix a wrong answer" "400|500"
P16_ANS="HTTP $ST: $ERR"

api "$T" POST probe-transit/keys/probe-other '{"derived":true,"deletion_allowed":true}'
api "$T" POST probe-transit/encrypt/probe-other "$(jq -n --arg p "$plain" --arg c "$(b64 x)" '{plaintext: $p, context: $c}')"
CO=$(jq -r '.data.ciphertext' <<<"$BODY")
egp_put probe-no-import "$(grep -v '^import' vault/sentinel/codex-council-not-yourself.sentinel)" probe-transit/decrypt/probe-other
api "${TOK[seeker]}" POST probe-transit/decrypt/probe-other "$(jq -n --arg c "$CO" --arg x "$(b64 x)" '{ciphertext: $c, context: $x}')"
expect P17 III "EGP without import \"controlgroup\" (scratch path)" "every request denied" "403|500"
P17_ERR=$ERR
api "$T" DELETE sys/policies/egp/probe-no-import
api "${TOK[seeker]}" POST probe-transit/decrypt/probe-other "$(jq -n --arg c "$CO" --arg x "$(b64 x)" '{ciphertext: $c, context: $x}')"
expect P17 III "the same request after removing it" "plaintext" 200

# ── Act IV ────────────────────────────────────────────────────────────────────
echo "Act IV: rotate, min_decryption_version, trim"
dec_c1() { api "${TOK[seeker]}" POST probe-transit/decrypt/probe-clues "$(jq -n --arg c "$C1" --arg x "$(b64 lantern)" '{ciphertext: $c, context: $x}')"; }
api "$T" POST probe-transit/keys/probe-clues/rotate
expect P18 IV "rotate" "latest_version 2" "200|204"
api "$T" POST probe-transit/keys/probe-clues/trim '{"min_available_version":2}'
expect P21 IV "trim while min_encryption_version=0" "refused, Vault's text" "400"
P21_ERR=$ERR
api "$T" POST probe-transit/keys/probe-clues/config '{"min_decryption_version":2}'
dec_c1
expect P18 IV "decrypt a v1 ciphertext, min_decryption_version=2" "refused, Vault's text" "400"
P18_ERR=$ERR
api "$T" POST probe-transit/keys/probe-clues/config '{"min_decryption_version":1}'
dec_c1
expect P19 IV "lower min_decryption_version back to 1, decrypt v1" "allowed: the burn is reversible until trim" 200
api "$T" POST probe-transit/keys/probe-clues/config '{"min_decryption_version":2,"min_encryption_version":2}'
api "$T" POST probe-transit/keys/probe-clues/trim '{"min_available_version":2}'
expect P20 IV "trim min_available_version=2" "accepted" "200|204"
api "$T" GET probe-transit/keys/probe-clues
expect P20 IV "keys after trim" "only version 2" 200 '(.data.keys | keys) == ["2"]'
api "$T" POST probe-transit/keys/probe-clues/config '{"min_decryption_version":1}'
expect P20 IV "lower min_decryption_version to 1 after trim" "refused, Vault's text" "400"
P20_ERR=$ERR
dec_c1
expect P20 IV "decrypt a v1 ciphertext after trim" "refused, Vault's text" "400"
P20_DEC=$ERR

# ── Epilogue ──────────────────────────────────────────────────────────────────
echo "Epilogue: audit-hash and which node logs what"
api "${TOK[hash]}" POST sys/audit-hash/probe-file "$(jq -n --arg i "$(b64 lantern)" '{input: $i}')"
expect P22 Epilogue "audit-hash with update only" "?" "200|403"
P22_UPDATE="HTTP $ST${ERR:+: $ERR}"
api "${TOK[hashsudo]}" POST sys/audit-hash/probe-file "$(jq -n --arg i "$(b64 lantern)" '{input: $i}')"
expect P22 Epilogue "audit-hash with update + sudo" "hmac-sha256:..." 200 '.data.hash | startswith("hmac-sha256:")'
H=$(jq -r '.data.hash // empty' <<<"$BODY")
sleep 1
found=""
for n in $VCDX_CLUSTER_NODES; do
  if [ -n "$(audit "$n" ".type == \"request\" and .request.id == \"$P4_REQ\" and .request.data.context == \"$H\"")" ]; then found="$found $n"; fi
done
row P22 Epilogue "audit-hash(b64(lantern)) equals P4's logged context" "match" "found on:${found:- none}" "$([ -n "$found" ] && echo yes || echo no)"

# P23: send one request of each kind to a standby node and see which logs have it.
leader=$(curl -sf --cacert "$VAULT_CACERT" "$VAULT_ADDR/v1/sys/leader" | jq -r '.leader_address' | sed -E 's#https://([^:]+):.*#\1#')
standby=$(for n in $VCDX_CLUSTER_NODES; do [ "$n" != "$leader" ] && echo "$n" && break; done)
probe_node() { # <label> <request id>
  local where="" n
  sleep 1
  for n in $VCDX_CLUSTER_NODES; do [ -n "$(audit "$n" ".request.id == \"$2\"")" ] && where="$where $n"; done
  row P23 Epilogue "$1 sent to $standby (leader $leader)" "logged by" "${where:- nowhere}" "$([ -n "$where" ] && echo yes || echo no)"
  note "P23: $1 sent to standby $standby, leader $leader: logged by${where:- nowhere}"
}
PROBE_ADDR="https://127.0.0.1:$(vault_port_of "$standby")"
api "$T" POST probe-transit/encrypt/probe-clues "$(jq -n --arg p "$plain" --arg c "$(b64 lantern)" '{plaintext: $p, context: $c}')"
probe_node "transit encrypt" "$(jq -r .request_id <<<"$BODY")"
api "${TOK[seeker]}" POST probe-transform/decode/probe-scribe "$(jq -n --arg v "$enc" '{value: $v, transformation: "probe-ms"}')"
probe_node "transform decode" "$(jq -r .request_id <<<"$BODY")"
api "$T" GET probe-kv/data/letter "" "X-Vault-Wrap-TTL: 120"
W2=$(jq -r '.wrap_info.token' <<<"$BODY")
api "${TOK[courier]}" POST sys/wrapping/unwrap "$(jq -n --arg t "$W2" '{token: $t}')"
probe_node "wrapping unwrap" "$(jq -r .request_id <<<"$BODY")"
PROBE_ADDR=""

# P10: who the log names for each unwrap of the first letter.
for who in interceptor courier; do
  e=$(for n in $VCDX_CLUSTER_NODES; do audit "$n" '.type == "response" and .request.path == "sys/wrapping/unwrap"'; done |
    jq -s -c --arg ent "${ENT[$who]}" '[.[] | select(.auth.entity_id == $ent)] | first | {display_name: .auth.display_name, entity_id: (.auth.entity_id != null), error: (.error // null)}')
  row P10 II "audit: the $who's unwrap" "auth.display_name, auth.entity_id" "$e" "$(jq -e '.display_name != null' <<<"$e" >/dev/null 2>&1 && echo yes || echo no)"
done

# ── P24: Terraform coverage ───────────────────────────────────────────────────
echo "Terraform: provider 5.13.0 coverage (scratch root terraform/probe)"
if out=$("$VCDX_ROOT/scripts/tf.sh" probe apply -no-color 2>&1); then
  row P24 Terraform "vault_transform_template, _transformation, vault_egp_policy, control_group policy" "applied" "$(grep -E '^Apply complete' <<<"$out")" yes
  "$VCDX_ROOT/scripts/tf.sh" probe plan -no-color >/dev/null 2>&1 && r=yes || r=no
  row P24 Terraform "plan after apply" "no changes (exit 0)" "exit $([ $r = yes ] && echo 0 || echo 2)" $r
  "$VCDX_ROOT/scripts/tf.sh" probe destroy -no-color >/dev/null 2>&1 || true
else
  row P24 Terraform "scratch root apply" "applied" "$(grep -E 'Error' <<<"$out" | head -2)" no
  "$VCDX_ROOT/scripts/tf.sh" probe destroy -no-color >/dev/null 2>&1 || true
fi

# ── P25: Ansible no_log ───────────────────────────────────────────────────────
echo "Ansible: no_log on success and on failure"
marker="probe-marker-$(openssl rand -hex 6)"
out=$(PROBE_TOKEN_FILE="$VCDX_STATE/tokens/probe" "$VCDX_ROOT/scripts/ansible.sh" probe -e "probe_marker=$marker" 2>&1 || true)
grep -E '^localhost' <<<"$out" | head -1 >/dev/null
row P25 Ansible "uri encrypt/decrypt round trip + a refused task (400), no_log" "round trip ok, marker never printed" \
  "$(grep -cF "$marker" <<<"$out" | sed 's/^/marker printed /') times; $(grep -E '^localhost' <<<"$out" | sed -E 's/ +/ /g')" \
  "$( [ "$(grep -cF "$marker" <<<"$out")" = 0 ] && grep -qE 'ok=4 .*failed=0' <<<"$out" && echo yes || echo no)"

# ── docs/capabilities.md ──────────────────────────────────────────────────────
version=$(vault_json | jq -r .version)
{
  echo "<!-- markdownlint-disable MD013 -->"
  echo
  echo "# Capabilities (generated by make probe)"
  echo
  echo "Generated $(date -u +%Y-%m-%d) against Vault $version, $pass passed, $fail failed, $(($(date +%s) - started))s."
  echo "Scratch mounts only; every one is removed at the end. Do not edit by hand."
  echo
  echo "Licence features: $features."
  echo
  echo "| Case | Act | Call | Expected | Vault's answer | Match |"
  echo "| --- | --- | --- | --- | --- | --- |"
  cat "$ROWS"
  echo
  echo "## Open questions answered"
  echo
  echo "1. Licence: Transform Secrets Engine, Control Groups and Sentinel are all present (P1)."
  echo "2. Error texts, verbatim:"
  echo "   - wrong derivation context (P5): \`$P5_ERR\`"
  echo "   - no context on a derived key (P6): \`$P6_ERR\`"
  echo "   - ciphertext below min_decryption_version (P18): \`$P18_ERR\`"
  echo "   - lowering min_decryption_version after trim (P20): \`$P20_ERR\`"
  echo "   - decrypt after trim (P20): \`$P20_DEC\`"
  echo "   - trim while min_encryption_version is 0 (P21): \`$P21_ERR\`"
  echo "   - unwrap of a used token (P8): \`$P8_ERR\`"
  echo "   - lookup of a used token (P9): \`$P9_ERR\`"
  echo "   - unwrap of a control-grouped request with one approval (P12): \`$P12_ERR\`"
  echo "3. An approved request with the wrong context (P16): \`$P16_ANS\`. A council cannot fix a wrong answer."
  echo "4. \`length(others) > 0\` lets a requester count themselves plus one other (P15); \`length(others) >= 2\`"
  echo "   makes 2 of 3 mean two people other than the requester. Vault reports the EGP's denial of an"
  echo "   approved control-group request as a control-group refusal: \`$P15_ERR\` (HTTP 400, not 403)."
  echo "5. sys/audit-hash with \`update\` only: $P22_UPDATE.$([[ "$P22_UPDATE" == "HTTP 200"* ]] && echo ' No sudo needed: codex-archivist gets update only.')"
  echo "6. The node that receives a request writes its audit entry (performance standbys serve these"
  echo "   requests themselves): $(grep '^- P23' "$NOTES" | sed 's/^- P23: //' | paste -sd ';' -). The ledger reads all three nodes."
  echo "7. Provider 5.13.0 covers \`vault_transform_template\`, \`vault_transform_transformation\` (fpe),"
  echo "   \`vault_transform_role\`, \`vault_egp_policy\` and a \`vault_policy\` with \`control_group\` (P24): no"
  echo "   \`vault_generic_endpoint\` needed."
  echo "8. An EGP without \`import \"controlgroup\"\` (P17): \`$P17_ERR\`."
  echo
  echo "## Notes"
  echo
  cat "$NOTES"
} >"$OUT"
echo
echo "probe: $pass passed, $fail failed; wrote docs/capabilities.md"
[ "$fail" -eq 0 ]
