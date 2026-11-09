#!/usr/bin/env bash
# scripts/stage-reset.sh (make stage-reset [CONFIRM=yes]): delete both story
# keys and the stage, then stage again (ansible/stage-reset.yml).
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
if [ "${CONFIRM:-}" != yes ]; then
  printf 'This deletes codex-clues, codex-cryptex and every stage record, then stages again. Type RESET: '
  read -r answer
  [ "$answer" = RESET ] || die "stage-reset: aborted"
fi
"$VCDX_ROOT/scripts/ansible.sh" stage-reset
