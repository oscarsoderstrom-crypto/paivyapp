#!/usr/bin/env bash
# Encrypted logical backup of the self-hosted Supabase Postgres database.
# Produces a custom-format pg_dump (compressed), encrypts it with GnuPG,
# applies a retention window, and can copy off-box with rclone. Schedule via
# cron or a systemd timer.
#
# Required env:
#   POSTGRES_PASSWORD    db superuser password
#   GPG_PASSPHRASE_FILE  path to a file holding the symmetric encryption passphrase
# Optional env:
#   DB_CONTAINER     docker container of the db    (default: supabase-db)
#   BACKUP_DIR       where to write dumps          (default: ./backups)
#   RETENTION_DAYS   delete local dumps older than (default: 14)
#   RCLONE_REMOTE    e.g. b2:paivy-backups         (off-site copy; skipped if unset)
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}"
: "${GPG_PASSPHRASE_FILE:?set GPG_PASSPHRASE_FILE (path to the backup encryption passphrase)}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
out="${BACKUP_DIR}/paivy-${ts}.dump.gpg"

echo "[$(date -u +%T)] dumping ${DB_CONTAINER} -> ${out}"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  pg_dump -U postgres -d postgres -Fc \
  | gpg --symmetric --cipher-algo AES256 --batch --yes \
        --passphrase-file "$GPG_PASSPHRASE_FILE" -o "$out"

echo "[$(date -u +%T)] wrote $(du -h "$out" | cut -f1)"

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  echo "[$(date -u +%T)] syncing to ${RCLONE_REMOTE}"
  rclone copy "$out" "$RCLONE_REMOTE"
fi

# Retention (local copies only; manage remote retention on the remote side)
find "$BACKUP_DIR" -name 'paivy-*.dump.gpg' -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo "[$(date -u +%T)] done"
