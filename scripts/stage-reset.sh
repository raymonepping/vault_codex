#!/usr/bin/env bash
# scripts/stage-reset.sh (make stage-reset [CONFIRM=yes]): delete both story
# keys and the stage, stage again (ansible/stage-reset.yml), rotate the audit logs.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
if [ "${CONFIRM:-}" != yes ]; then
  printf 'This deletes codex-clues, codex-cryptex and every stage record, then stages again. Type RESET: '
  read -r answer
  [ "$answer" = RESET ] || die "stage-reset: aborted"
fi
"$VCDX_ROOT/scripts/ansible.sh" stage-reset

# A new show starts a new ledger: each node's audit log moves to audit.log.1
# (the previous show is kept, older ones go) and SIGHUP makes Vault reopen the
# file. Without this the logs only grow and the API reads them from byte 0.
for node in $VCDX_CLUSTER_NODES; do
  c=$(vault_container "$node")
  [ "$(vcdx_container_state "$c")" = running ] || continue
  podman exec "$c" sh -c 'test -f /vault/audit/audit.log && mv -f /vault/audit/audit.log /vault/audit/audit.log.1' || true
  podman kill --signal HUP "$c" >/dev/null
done
echo "stage-reset: audit logs rotated (audit.log.1 holds the previous show)"
