#!/usr/bin/env bash
# scripts/rehearsal.sh (make rehearsal): every act through the API (the path
# the console uses), including each way it must fail, one row per case with
# Vault's status and error verbatim. Waits on Vault's state (a letter's own
# creation_time + ttl), never on a guessed sleep. Starts and ends with a
# fresh stage. R2, R5 and R17 have no console button: they ask Vault directly
# as that identity (a persona's own login; ansible-platform for R17).
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VCDX_ROOT"
t_start=$(date +%s)
BASE="https://localhost:$(vcdx_conf VCDX_PORT_WEB)"
C=config/codex.json
ans() { jq -r --arg a "$1" '.acts[] | select(.id == $a) | .answer' "$C"; }
txt() { jq -r --arg a "$1" '.acts[] | select(.id == $a) | .plaintext' "$C"; }
OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT
pass=0
fail=0
row() { # <case> <label> <yes|no> <detail>
  if [ "$3" = yes ]; then pass=$((pass + 1)); printf '  \033[32mPASS\033[0m %-4s %-56s %s\n' "$1" "$2" "$(cut -c1-90 <<<"$4")"
  else fail=$((fail + 1)); printf '  \033[31mFAIL\033[0m %-4s %-56s %s\n' "$1" "$2" "$(cut -c1-200 <<<"$4")"; fi
}
said() { jq -r '[.outcome // .error // empty, (.vault.status // empty | tostring), (.vault.errors[0] // empty)] | join(" | ")' "$OUT" 2>/dev/null; }
# api <case> <label> <METHOD> <path> <body|""> <jq test>
api() {
  local c=$1 label=$2 method=$3 path=$4 body=$5 test=$6
  curl -sS -o "$OUT" --cacert vault-tls/ca-chain.pem -X "$method" -H "Authorization: Bearer $AT" \
    ${body:+-H 'content-type: application/json' -d "$body"} "$BASE$path" >/dev/null || true
  if jq -e "$test" "$OUT" >/dev/null 2>&1; then row "$c" "$label" yes "$(said)"; else row "$c" "$label" no "$(said)"; fi
}
j() { jq -cn --arg a "$1" "{${2:-answer}: \$a}"; }
# direct <case> <label> <persona|token:name> <path> <json> <want status> [error regex]
direct() {
  local c=$1 label=$2 who=$3 path=$4 body=$5 want=$6 re=${7:-.} code err
  vault_cluster
  if [[ "$who" == token:* ]]; then vault_token "${who#token:}"; else persona_login "$who"; fi
  code=$(curl -sS -o "$OUT" -w '%{http_code}' --cacert "$VAULT_CACERT" -H "X-Vault-Token: $VAULT_TOKEN" -d "$body" "$VAULT_ADDR/v1/$path" || echo 000)
  unset VAULT_TOKEN
  err=$(jq -r '.errors[0] // empty' "$OUT" 2>/dev/null | tr '\n\t' '  ')
  if [ "$code" = "$want" ] && grep -Eq "$re" <<<"${err:-ok}"; then row "$c" "$label" yes "HTTP $code${err:+ | $err}"; else row "$c" "$label" no "HTTP $code${err:+ | $err}"; fi
}

echo "rehearsal: a fresh stage"
CONFIRM=yes ./scripts/stage-reset.sh >/dev/null
kc="http://127.0.0.1:$(vcdx_conf VCDX_PORT_KEYCLOAK)/realms/codex/protocol/openid-connect/token"
AT=$(tr -d '\n' <.secrets/cast/seeker | curl -sf "$kc" -d grant_type=password -d client_id=codex-stagehand -d scope=openid \
  --data-urlencode username=seeker --data-urlencode "password@-" | jq -r .access_token) || die "rehearsal: Keycloak refused the seeker"
MS=$(vault_cluster && vault_token ansible-platform && curl -sf --cacert "$VAULT_CACERT" -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/codex/data/stage/manuscript" | jq -r .data.data.value)
C1=$(vault_cluster && vault_token ansible-platform && curl -sf --cacert "$VAULT_CACERT" -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/codex/data/stage/act-1" | jq -r .data.data.ciphertext)

echo "Prologue"
api R1 "the Seeker decodes the manuscript" POST /api/prologue/decode "" ".outcome == \"decoded\" and .reveal.date == \"$(txt prologue)\" and (.manuscript | test(\"^[0-9]{4}-[0-9]{2}-[0-9]{2}$\"))"
direct R2 "the Interceptor decodes" interceptor transform/decode/codex-scribe "$(jq -cn --arg v "$MS" '{value: $v, transformation: "manuscript"}')" 403 "permission denied"

echo "Act I"
api R3 "france" POST /api/act/1/answer "$(j france)" '.outcome == "refused" and (.vault.errors[0] | test("message authentication failed"))'
a=$(ans prologue)
api R4 "the right answer with spaces and a capital" POST /api/act/1/answer "$(j "  ${a^} ")" ".outcome == \"opened\" and .reveal.text == $(txt act-1 | jq -R .)"
direct R5 "the Interceptor decrypts with the right answer" interceptor transit/decrypt/codex-clues "$(jq -cn --arg c "$C1" --arg x "$(printf %s "$(ans prologue)" | base64)" '{ciphertext: $c, context: $x}')" 403 "permission denied"

echo "Act II"
api R6 "letter, the Courier delivers" POST /api/act/2/letter "" '.outcome == "sealed"'
api R6 "  ...delivered, the seal intact" POST /api/act/2/deliver "" '.outcome == "delivered" and .seal == "intact" and .vault.as == "courier"'
api R6 "  ...riddle I's answer opens it" POST /api/act/2/answer "$(j "$(ans act-1)")" ".outcome == \"opened\" and .reveal.text == $(txt act-2 | jq -R .)"
api R7 "letter, the Interceptor first" POST /api/act/2/letter "" '.outcome == "sealed"'
api R8 "  ...the Interceptor's loot: a ciphertext they cannot open" POST /api/act/2/intercept "" '.outcome == "intercepted" and .attempt.status == 403'
api R7 "  ...then the Courier: refused" POST /api/act/2/deliver "" '.outcome == "broken" and (.vault.errors[0] | test("not valid or does not exist"))'
api R9 "letter left past its TTL" POST /api/act/2/letter "" '.outcome == "sealed"'
end=$(jq -r '(.letter.creation_time | sub("\\.[0-9]+"; "") | sub("Z$"; "Z") | fromdateiso8601) + .letter.ttl' "$OUT" 2>/dev/null || echo 0)
wait=$((end - $(date +%s) + 3))
[ "$wait" -gt 0 ] && echo "  (waiting ${wait}s: the letter's own creation_time + ttl)" && sleep "$wait"
api R9 "  ...then delivered: refused, expired" POST /api/act/2/deliver "" '.outcome == "broken"'

echo "Act III"
api R10 "the Seeker requests with riddle II's answer" POST /api/act/3/request "$(j "$(ans act-2)")" '.outcome == "held"'
api R14 "the Seeker approves: not a Keyholder" POST /api/act/3/approve "$(j seeker keyholder)" '.outcome == "forbidden" and .vault.status == 403'
api R10 "one approval (amber)" POST /api/act/3/approve "$(j amber keyholder)" '.outcome == "counted"'
api R10 "  ...open: stays shut" POST /api/act/3/open "" '.outcome == "shut" and (.vault.errors[0] | test("further authorization"))'
api R11 "second approval (ivory)" POST /api/act/3/approve "$(j ivory keyholder)" '.outcome == "approved"'
api R11 "  ...open: riddle III" POST /api/act/3/open "" ".outcome == \"opened\" and .reveal.text == $(txt act-3 | jq -R .)"
api R12 "Onyx requests" POST /api/act/3/request "$(jq -cn --arg a "$(ans act-2)" '{answer: $a, as: "onyx"}')" '.outcome == "held" and .requester == "onyx"'
api R12 "  ...Onyx approves their own request" POST /api/act/3/approve "$(j onyx keyholder)" '.vault.status == 200'
api R12 "  ...Amber approves: still not approved (EGP)" POST /api/act/3/approve "$(j amber keyholder)" '.approved == false'
api R12 "  ...open: refused" POST /api/act/3/open "" '.outcome == "shut" and (.why | test("onyx.s own"))'
api R12 "  ...Ivory approves" POST /api/act/3/approve "$(j ivory keyholder)" '.approved == true'
api R12 "  ...open: riddle III" POST /api/act/3/open "" '.outcome == "opened"'
api R13 "an approved request with the wrong answer" POST /api/act/3/request "$(j eight)" '.outcome == "held"'
api R13 "  ...amber" POST /api/act/3/approve "$(j amber keyholder)" '.vault.status == 200'
api R13 "  ...ivory" POST /api/act/3/approve "$(j ivory keyholder)" '.approved == true'
api R13 "  ...open: a council cannot fix a wrong answer" POST /api/act/3/open "" '.outcome == "shut" and (.vault.errors[0] | test("message authentication failed")) and (.why | test("cannot fix a wrong answer"))'

echo "Act IV"
api R15 "riddle III's answer: the final message" POST /api/act/4/answer "$(j "$(ans act-3)")" ".outcome == \"opened\" and .reveal.text == $(txt act-4 | jq -R .)"
api R16 "burn" POST /api/act/4/burn "" '.outcome == "burned" and .latest_version == 2'
api R16 "  ...replay Act I with its answer: too old" POST /api/act/4/replay "$(j "$(ans prologue)")" '.outcome == "ash" and (.vault.errors[0] | test("too old"))'
api R17 "trim" POST /api/act/4/trim "" '.outcome == "trimmed" and .versions == [2]'
direct R17 "  ...lower min_decryption_version again" token:ansible-platform transit/keys/codex-clues/config '{"min_decryption_version":1}' 400 "min available version"

echo "Epilogue"
api R18 "the ledger: the Interceptor opened a letter" GET /api/ledger "" '[.events[] | select(.kind == "letter opened" and .who == "interceptor")] | length >= 1'
api R18 "  ...approvals by amber, ivory and onyx" GET /api/ledger "" '([.events[] | select(.kind == "approval") | .who] | unique) == ["amber", "ivory", "onyx"]'
api R18 "  ...wrong answers, shut cryptex, burn, ash, trim" GET /api/ledger "" '([.events[].kind] | (index("answer refused") != null) and (index("the cryptex stays shut") != null) and (index("the map burns: old versions refused") != null) and (index("refused: the map is ash") != null) and (index("the ashes are swept: old versions gone") != null))'
api R18 "  ...every node's log was read" GET /api/ledger "" '[.nodes[] | select(.error == null)] | length == 3'
api R19 "confirm france" POST /api/ledger/confirm "$(j france guess)" '.outcome == "tried"'
api R19 "confirm paris" POST /api/ledger/confirm "$(j paris guess)" '.outcome == "never tried"'

echo "Layers"
if TF_ONLY=1 ./scripts/drift.sh >/dev/null 2>&1; then row R20 "make drift after the full show (keys are runtime state)" yes "every Terraform plan empty"; else row R20 "make drift after the full show" no "see .build/logs/drift-*.log"; fi
CONFIRM=yes ./scripts/stage-reset.sh >/dev/null
if ./scripts/idempotency.sh >/dev/null 2>&1; then row R21 "make idempotency after stage-reset" yes "every Ansible phase changed=0"; else row R21 "make idempotency after stage-reset" no "see .build/logs/idempotency-*.log"; fi

echo
echo "rehearsal: $pass passed, $fail failed in $(($(date +%s) - t_start))s; the stage is fresh"
[ "$fail" -eq 0 ]
