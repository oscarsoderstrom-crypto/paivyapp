#!/usr/bin/env bash
# Bootstraps the FIRST hr-admin on a fresh database.
#
# Why this is needed: after migration 002, signup is invite-only AND only an
# hr-admin can create invitations — so a brand-new database cannot onboard its
# first admin through the app. This script breaks that deadlock using
# database-level access, which bypasses RLS:
#   1. insert a 'manager' invitation directly (skips the hr-admin-only policy)
#   2. create the user via GoTrue's admin API (the trigger consumes the invite)
#   3. elevate that profile to hr-admin via psql (superuser bypasses the RPC)
#
# Run ONCE per fresh environment. Not idempotent — step 2 fails if the user
# already exists.
#
# Required env:
#   SUPABASE_URL      e.g. https://api.staging.paivy.fi  (the Kong gateway URL)
#   SERVICE_ROLE_KEY  the service_role JWT
#   POSTGRES_PASSWORD the db superuser password
#   ADMIN_EMAIL, ADMIN_PASSWORD
# Optional:
#   DB_CONTAINER  (default: supabase-db)
#   ADMIN_NAME    (default: "Paivy Admin")
#   ADMIN_TEAM    (default: Engineering)
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SERVICE_ROLE_KEY:?set SERVICE_ROLE_KEY}"
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}"
: "${ADMIN_EMAIL:?set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
ADMIN_NAME="${ADMIN_NAME:-Paivy Admin}"
ADMIN_TEAM="${ADMIN_TEAM:-Engineering}"

run_psql() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

email="$(printf '%s' "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]')"
code="bootstrap$(openssl rand -hex 4)"    # >= 8 chars; used as the invite code
token="${code}$(openssl rand -hex 28)"    # invitation token must START WITH the code

echo "1/3  inserting bootstrap invitation for ${email}"
run_psql <<SQL
insert into public.invitations (email, role, team_id, token)
values (
  '${email}', 'manager',
  (select id from public.teams where name = '${ADMIN_TEAM}' limit 1),
  '${token}'
)
on conflict do nothing;
SQL

echo "2/3  creating the auth user via the admin API"
curl -fsS -X POST "${SUPABASE_URL%/}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${email}\",\"password\":\"${ADMIN_PASSWORD}\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"${ADMIN_NAME}\",\"invite_code\":\"${code}\"}}" \
  >/dev/null
echo "     created"

echo "3/3  elevating ${email} to hr-admin"
run_psql <<SQL
update public.profiles set role = 'hr-admin'
where id = (select id from auth.users where email = '${email}');
SQL

echo "Done. ${email} is now hr-admin and can invite everyone else from the app."
