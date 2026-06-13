#!/usr/bin/env bash
# Seeds the STAGING database with SYNTHETIC users and data so the testing bed
# never holds real employee PII. Idempotent-ish: invitations use ON CONFLICT
# DO NOTHING and user creation tolerates "already exists".
#
# Requires the stack running. service_role bypasses RLS for the invitation
# inserts, and the admin API creates real, login-able users (the trigger turns
# each invite into a profile with the right role/team).
#
# Required env: SUPABASE_URL, SERVICE_ROLE_KEY, POSTGRES_PASSWORD
# Optional:     DB_CONTAINER (default supabase-db), SEED_PASSWORD (default Password123!)
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SERVICE_ROLE_KEY:?set SERVICE_ROLE_KEY}"
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
SEED_PASSWORD="${SEED_PASSWORD:-Password123!}"

run_psql() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

# name | email | role | team
users=(
  "Aino Virtanen|aino@example.test|employee|Engineering"
  "Mikko Korhonen|mikko@example.test|manager|Engineering"
  "Liisa Makinen|liisa@example.test|employee|Design"
  "Juha Nieminen|juha@example.test|employee|Marketing"
)

for row in "${users[@]}"; do
  IFS='|' read -r name email role team <<< "$row"
  email="$(printf '%s' "$email" | tr '[:upper:]' '[:lower:]')"
  code="seed$(openssl rand -hex 4)"
  token="${code}$(openssl rand -hex 28)"
  echo "seeding ${email} (${role}, ${team})"
  run_psql <<SQL
insert into public.invitations (email, role, team_id, token)
values ('${email}', '${role}', (select id from public.teams where name='${team}' limit 1), '${token}')
on conflict do nothing;
SQL
  curl -fsS -X POST "${SUPABASE_URL%/}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${SEED_PASSWORD}\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"${name}\",\"invite_code\":\"${code}\"}}" \
    >/dev/null || echo "  (user may already exist — skipping)"
done

echo "adding sample work logs and a pending vacation request"
run_psql <<'SQL'
-- a week of office/home logs for Aino
insert into public.work_logs (user_id, date, type)
select u.id, d::date,
       (array['office','home','office','home','office','off','off'])[1 + extract(dow from d)::int]
from auth.users u
cross join generate_series(current_date - 6, current_date, interval '1 day') d
where u.email = 'aino@example.test'
on conflict (user_id, date) do nothing;

-- a pending vacation request for Liisa (something for the hr-admin to approve)
insert into public.vacation_requests (user_id, start_date, end_date, type, status)
select id, current_date + 14, current_date + 18, 'paid', 'pending'
from auth.users where email = 'liisa@example.test';
SQL

echo "Seed complete. Synthetic logins use password: ${SEED_PASSWORD}"
