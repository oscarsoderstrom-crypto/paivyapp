# infra/ — self-hosting Päivy's backend

These are the portable artifacts for moving Päivy off hosted Supabase onto your
own Supabase stack. They are designed for **parity**: the same files run on the
ThinkStation staging box and later on the Hetzner production server — only the
internet-exposure layer differs.

Full walkthrough: [`docs/db-migration-runbook.md`](../docs/db-migration-runbook.md).

## Contents

| Path | Purpose |
|---|---|
| `docker/.env.template` | The security-critical + app-specific overrides for Supabase's `docker/.env` |
| `scripts/generate-secrets.sh` | Generate DB password, JWT secret, and the anon/service_role API keys |
| `scripts/bootstrap-admin.sh` | Create the **first** hr-admin on a fresh DB (breaks the invite-only deadlock) |
| `scripts/seed-staging.sh` | Populate staging with **synthetic** users + data (no real PII) |
| `scripts/backup.sh` | Encrypted nightly `pg_dump` with retention + optional off-site sync |
| `scripts/restore.sh` | Restore an encrypted backup (triggers disabled during load) |
| `cloudflared/config.example.yml` | Cloudflare Tunnel config for the NAT'd staging box |

## Quick order of operations (staging)

```sh
# 1. bring up the stack (see runbook for the supabase clone + docker compose)
infra/scripts/generate-secrets.sh            # -> infra/docker/.env.secrets
# 2. copy secrets + infra/docker/.env.template values into supabase/docker/.env
# 3. apply migrations 001 -> 002 -> 003 (see runbook)
SUPABASE_URL=... SERVICE_ROLE_KEY=... POSTGRES_PASSWORD=... \
  ADMIN_EMAIL=you@paivy.fi ADMIN_PASSWORD=... infra/scripts/bootstrap-admin.sh
SUPABASE_URL=... SERVICE_ROLE_KEY=... POSTGRES_PASSWORD=... \
  infra/scripts/seed-staging.sh
```

> ⚠️ The scripts have been syntax-checked but not run against a live stack in
> CI. Some values (GoTrue env var names, the admin-API user payload) are
> Supabase-version-sensitive — cross-check against the upstream
> `supabase/docker/.env.example` for your pinned version before relying on them.
> Never commit `infra/docker/.env.secrets`, real `.env`, `*.gpg`, or
> `cloudflared/*.json` (they are git-ignored).
