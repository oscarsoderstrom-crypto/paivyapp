#!/usr/bin/env bash
# Restore an encrypted pg_dump produced by backup.sh into the self-hosted
# Supabase database.
#
#   CONFIRM=yes ./restore.sh ./backups/paivy-YYYYMMDDTHHMMSSZ.dump.gpg
#
# DESTRUCTIVE: --clean --if-exists drops existing objects before recreating
# them. Triggers are disabled during the data load so on_auth_user_created does
# NOT fire while auth.users rows are restored (which would otherwise try to
# re-create profiles and fail).
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}"
: "${GPG_PASSPHRASE_FILE:?set GPG_PASSPHRASE_FILE}"
FILE="${1:?usage: CONFIRM=yes ./restore.sh <backup.dump.gpg>}"

[[ "${CONFIRM:-}" == "yes" ]] || {
  echo "Refusing to run without CONFIRM=yes (this overwrites the database)." >&2; exit 1; }
[[ -f "$FILE" ]] || { echo "No such file: $FILE" >&2; exit 1; }

echo "Restoring $FILE into ${DB_CONTAINER} (destructive)..."
gpg --decrypt --batch --passphrase-file "$GPG_PASSPHRASE_FILE" "$FILE" \
  | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
      pg_restore -U postgres -d postgres --clean --if-exists --no-owner --disable-triggers

echo "Restore complete. Verify row counts and run a test login before trusting it."
