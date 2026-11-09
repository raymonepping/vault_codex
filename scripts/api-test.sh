#!/usr/bin/env bash
# scripts/api-test.sh (make api-test): every act through the API against the
# live stack, the happy path and its refusals, as the Seeker (a Keycloak
# access token sent as Bearer; the stage hands are the API's own). Then a
# fresh stage (make stage-reset CONFIRM=yes). This host script may know the
# answers (config/codex.json); the API never does.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VCDX_ROOT"

if [ "$(vcdx_container_state vcdx-web)" = running ]; then BASE="https://localhost:$(vcdx_conf VCDX_PORT_WEB)"; else BASE="http://127.0.0.1:$(vcdx_conf VCDX_PORT_API)"; fi
C=config/codex.json
ans() { jq -r --arg a "$1" '.acts[] | select(.id == $a) | .answer' "$C"; }
txt() { jq -r --arg a "$1" '.acts[] | select(.id == $a) | .plaintext' "$C"; }

kc="http://127.0.0.1:$(vcdx_conf VCDX_PORT_KEYCLOAK)/realms/codex/protocol/openid-connect/token"
AT=$(tr -d '\n' <.secrets/cast/seeker | curl -sf "$kc" -d grant_type=password -d client_id=codex-stagehand -d scope=openid \
  --data-urlencode username=seeker --data-urlencode "password@-" | jq -r .access_token) || die "api-test: Keycloak refused the seeker"

pass=0
fail=0
OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT
# req <label> <METHOD> <path> <json body|""> <jq test>
req() {
  local label=$1 method=$2 path=$3 body=$4 test=$5 code
  code=$(curl -sS -o "$OUT" -w '%{http_code}' --cacert vault-tls/ca-chain.pem -X "$method" \
    -H "Authorization: Bearer $AT" ${body:+-H 'content-type: application/json' -d "$body"} "$BASE$path" || echo 000)
  if jq -e "$test" "$OUT" >/dev/null 2>&1; then
    pass=$((pass + 1))
    printf '  \033[32mPASS\033[0m %-58s %s\n' "$label" "$(jq -r '[.outcome // empty, (.vault.status // empty | tostring), (.vault.errors[0] // empty)] | join(" | ")' "$OUT" | cut -c1-90)"
  else
    fail=$((fail + 1))
    printf '  \033[31mFAIL\033[0m %-58s HTTP %s %s\n' "$label" "$code" "$(jq -c '{outcome, error, vault: .vault | {status, errors, as}}' "$OUT" 2>/dev/null | cut -c1-200)"
  fi
}
j() { jq -cn --arg a "$1" "{${2:-answer}: \$a}"; }

echo "api-test against $BASE"
req "health: three nodes, the Archivist's token" GET /api/health "" '.ok and (.nodes | map(select(.reachable)) | length == 3) and .archivist.tokenPresent'
req "me: the seeker, as Vault sees them" GET /api/me "" '.signedIn and .user == "seeker" and (.policies | index("codex-seeker") != null)'
req "codex: staged, no answer in the story" GET /api/codex "" '.stage["act-1"] != null and (.codex.acts | map(has("answer")) | any | not)'

echo "Prologue"
req "decode the manuscript" POST /api/prologue/decode "" ".outcome == \"decoded\" and .reveal.date == \"$(txt prologue)\" and .vault.as == \"seeker\""

echo "Act I"
req "a wrong answer: Vault refuses" POST /api/act/1/answer "$(j france)" '.outcome == "refused" and (.vault.errors[0] | test("message authentication failed"))'
req "the right answer, typed sloppily" POST /api/act/1/answer "$(j "  $(ans prologue | tr a-z A-Z) ")" ".outcome == \"opened\" and .reveal.text == $(txt act-1 | jq -R .)"

echo "Act II"
req "the Archivist seals a letter" POST /api/act/2/letter "" '.outcome == "sealed" and .letter.accessor != null and .vault.as == "archivist" and (.vault | tostring | test("\"token\"") | not)'
req "the Interceptor opens it first" POST /api/act/2/intercept "" '.outcome == "intercepted" and (.loot | startswith("vault:v")) and .vault.as == "interceptor" and .attempt.status == 403'
req "the Courier finds the seal broken" POST /api/act/2/deliver "" '.outcome == "broken" and (.vault.errors[0] | test("not valid or does not exist"))'
req "a new letter" POST /api/act/2/letter "" '.outcome == "sealed"'
req "the Courier delivers it" POST /api/act/2/deliver "" '.outcome == "delivered" and .seal == "intact" and .vault.as == "courier"'
req "the answer to riddle I opens the letter" POST /api/act/2/answer "$(j "$(ans act-1)")" ".outcome == \"opened\" and .reveal.text == $(txt act-2 | jq -R .)"

echo "Act III"
req "ask the council" POST /api/act/3/request "$(j "$(ans act-2)")" '.outcome == "held" and .requester == "seeker"'
req "status: waiting" GET /api/act/3/status "" '.outcome == "waiting" and .approved == false'
req "the seeker cannot approve" POST /api/act/3/approve "$(j seeker keyholder)" '.outcome == "forbidden" and .vault.status == 403'
req "amber approves" POST /api/act/3/approve "$(j amber keyholder)" '.outcome == "counted" and .vault.as == "amber"'
req "one approval: the cryptex stays shut" POST /api/act/3/open "" '.outcome == "shut" and (.vault.errors[0] | test("further authorization"))'
req "ivory approves" POST /api/act/3/approve "$(j ivory keyholder)" '.outcome == "approved"'
req "status: approved by amber and ivory" GET /api/act/3/status "" '.approved and (.authorizations | sort == ["amber", "ivory"])'
req "two approvals: the cryptex opens" POST /api/act/3/open "" ".outcome == \"opened\" and .reveal.text == $(txt act-3 | jq -R .)"
req "onyx asks, then approves their own request" POST /api/act/3/request "$(jq -cn --arg a "$(ans act-2)" '{answer: $a, as: "onyx"}')" '.outcome == "held" and .requester == "onyx"'
req "onyx approves" POST /api/act/3/approve "$(j onyx keyholder)" '.vault.status == 200'
req "amber approves: the EGP does not count onyx" POST /api/act/3/approve "$(j amber keyholder)" '.outcome == "counted" and .approved == false'
req "self + one: the cryptex stays shut" POST /api/act/3/open "" '.outcome == "shut" and (.why | test("onyx.s own"))'
req "ivory approves: two other people" POST /api/act/3/approve "$(j ivory keyholder)" '.vault.status == 200'
req "now it opens" POST /api/act/3/open "" '.outcome == "opened"'

echo "Act IV"
req "the final message" POST /api/act/4/answer "$(j "$(ans act-3)")" ".outcome == \"opened\" and .reveal.text == $(txt act-4 | jq -R .)"
req "burn the map" POST /api/act/4/burn "" '.outcome == "burned" and .latest_version == 2'
req "act I again: ash" POST /api/act/4/replay "$(j "$(ans prologue)")" '.outcome == "ash" and (.vault.errors[0] | test("too old"))'
req "sweep the ashes" POST /api/act/4/trim "" '.outcome == "trimmed" and .versions == [2]'

echo "Epilogue"
req "the ledger names the Interceptor" GET /api/ledger "" '[.events[] | select(.kind == "letter opened" and .who == "interceptor")] | length >= 1'
req "the ledger has both approvals and the burn" GET /api/ledger "" '([.events[] | select(.kind == "approval")] | length >= 2) and ([.events[] | select(.kind | test("burns"))] | length >= 2)'
req "confirm a guess that was tried" POST /api/ledger/confirm "$(j france guess)" '.outcome == "tried" and (.tried[0].who == "seeker")'
req "confirm a guess never tried" POST /api/ledger/confirm "$(j paris guess)" '.outcome == "never tried"'
req "layers: phases and gates" GET /api/layers "" '.layers.phases | length >= 10'

echo
echo "api-test: $pass passed, $fail failed"
echo "api-test: a fresh stage for the next run"
CONFIRM=yes ./scripts/stage-reset.sh >/dev/null
[ "$fail" -eq 0 ]
