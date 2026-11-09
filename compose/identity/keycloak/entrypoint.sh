#!/bin/sh
# compose/identity/keycloak/entrypoint.sh (from Project Durin / vault_crypto).
# Keycloak 26 has no _FILE support for the bootstrap admin password: read it
# from the mounted .secrets/keycloak/admin-password (make identity-up creates
# it once), export it under KC_BOOTSTRAP_ADMIN_*, then exec the launcher.
set -eu
password_file=/run/secrets/keycloak/admin-password
[ -s "$password_file" ] || {
  echo "[entrypoint] $password_file is missing: run make identity-up" >&2
  exit 1
}
KC_BOOTSTRAP_ADMIN_USERNAME="admin"
KC_BOOTSTRAP_ADMIN_PASSWORD=$(cat "$password_file")
export KC_BOOTSTRAP_ADMIN_USERNAME KC_BOOTSTRAP_ADMIN_PASSWORD
exec /opt/keycloak/bin/kc.sh "$@"
