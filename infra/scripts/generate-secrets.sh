#!/usr/bin/env bash
# Generates the security-critical secrets for a self-hosted Supabase stack:
# the Postgres password, GoTrue JWT secret, the anon & service_role API keys
# (JWTs signed with that secret), realtime keys, and a dashboard password.
#
# Output is written to infra/docker/.env.secrets (git-ignored, mode 600). Run
# ONCE per environment — staging and production must get DIFFERENT secrets —
# and store the file in a password manager / sops. Never commit it.
#
# The anon/service_role keys are HS256 JWTs with the claims GoTrue expects.
# Cross-check the format against the current Supabase self-hosting docs.
set -euo pipefail

OUT="${1:-infra/docker/.env.secrets}"

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

if [[ -e "$OUT" ]]; then
  echo "Refusing to overwrite existing $OUT (delete it first if you really mean to)." >&2
  exit 1
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
rand()   { openssl rand -hex "$1"; }

sign_jwt() {
  local role="$1" secret="$2" iat exp header payload h p sig
  iat="$(date +%s)"
  exp="$(( iat + 315360000 ))"   # ~10 years
  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"role\":\"${role}\",\"iss\":\"supabase\",\"iat\":${iat},\"exp\":${exp}}"
  h="$(printf '%s' "$header"  | b64url)"
  p="$(printf '%s' "$payload" | b64url)"
  sig="$(printf '%s' "${h}.${p}" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)"
  printf '%s.%s.%s' "$h" "$p" "$sig"
}

POSTGRES_PASSWORD="$(rand 24)"
JWT_SECRET="$(rand 32)"          # 64 hex chars, well above the 32-char minimum
SECRET_KEY_BASE="$(rand 32)"     # 64 hex chars (realtime)
VAULT_ENC_KEY="$(rand 16)"       # exactly 32 chars (vault)
DASHBOARD_PASSWORD="$(rand 16)"
ANON_KEY="$(sign_jwt anon "$JWT_SECRET")"
SERVICE_ROLE_KEY="$(sign_jwt service_role "$JWT_SECRET")"

umask 077
cat > "$OUT" <<EOF
# GENERATED $(date -u +%Y-%m-%dT%H:%M:%SZ) — DO NOT COMMIT. Store in a secret manager.
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
VAULT_ENC_KEY=${VAULT_ENC_KEY}
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
EOF

echo "Wrote $OUT (mode 600). Copy these into your supabase/docker/.env."
echo
echo "Use this as the app's EXPO_PUBLIC_SUPABASE_ANON_KEY for this environment:"
echo "$ANON_KEY"
