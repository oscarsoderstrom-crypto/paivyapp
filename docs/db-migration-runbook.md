# Päivy backend migration runbook

Moving Päivy off hosted Supabase onto self-hosted infrastructure.

**Path:** hosted Supabase (disposable pre-solution) → **ThinkStation** (testing
bed) → **Hetzner** (production). The app is **pre-launch**, so no real user data
is migrated: the ThinkStation runs synthetic data only, and production launches
fresh on Hetzner.

**Guiding principle — design once, run twice.** Everything below the
internet-exposure layer is identical on both boxes, so the ThinkStation faithfully
rehearses the Hetzner deploy.

---

## What actually moves

The app depends on five Supabase components, so "moving the database" means
self-hosting the Supabase stack, not just Postgres:

| Component | Used for | Self-host |
|---|---|---|
| Postgres | data + RLS | ✅ |
| GoTrue (Auth) | signUp / signIn / JWT / `auth.users` trigger | ✅ |
| PostgREST | every `.from()` and `.rpc()` call | ✅ |
| Realtime | the pending-approval badge (`postgres_changes`) | ✅ |
| Kong | API gateway routing `/auth` `/rest` `/realtime` | ✅ |
| Storage, Edge Functions | — not used — | ❌ trim |

---

## ⚠️ First-admin bootstrap (read before deploying anything fresh)

After migration `002`, **signup is invite-only and only an hr-admin can create
invitations.** A brand-new database therefore cannot onboard its first admin
through the app — a deadlock. Every fresh deploy (ThinkStation, Hetzner) must be
bootstrapped out-of-band with `infra/scripts/bootstrap-admin.sh`, which uses
database-level access (bypasses RLS) to: insert a manager invitation → create the
user via the admin API → elevate to hr-admin. After that, normal invite-based
onboarding works from the app.

---

## Phase 1 — ThinkStation host prep

- Ubuntu Server 24.04 LTS with **full-disk encryption (LUKS)** — at-rest
  encryption for the (synthetic, but still) data.
- **≥32 GB RAM**, **NVMe**, a second disk for `./backups`, a **UPS** + `nut`.
- Docker Engine + Compose plugin; enable `unattended-upgrades`.
- Admin access via **Tailscale**, not public SSH. UFW default-deny inbound.

## Phase 2 — Bring up the Supabase stack

```sh
git clone --depth 1 https://github.com/supabase/supabase
cp supabase/docker/.env.example supabase/docker/.env
infra/scripts/generate-secrets.sh                 # -> infra/docker/.env.secrets
# merge infra/docker/.env.secrets + infra/docker/.env.template into supabase/docker/.env
cd supabase/docker && docker compose up -d
```

Trim `storage`, `imgproxy`, `functions` from `docker-compose.yml` (unused) to
save RAM. Keep db, auth, rest, realtime, kong, meta, studio, supavisor, vector.

Key `.env` points (see `infra/docker/.env.template` for the full set):
- `JWT_SECRET` drives `ANON_KEY` / `SERVICE_ROLE_KEY` — regenerate together; the
  app's `EXPO_PUBLIC_SUPABASE_ANON_KEY` must match this environment's anon key.
- `ENABLE_EMAIL_SIGNUP=true` (the invite gating is the trigger, not GoTrue).
- Staging: `ENABLE_EMAIL_AUTOCONFIRM=true` to skip SMTP. Production: `false` + SMTP.
- `ADDITIONAL_REDIRECT_URLS=paivyapp://*` so auth emails return to the app.

## Phase 3 — Apply schema

Apply the repo migrations **in order** against the new DB:

```sh
for f in supabase/migrations/001_initial.sql \
         supabase/migrations/002_security_fixes.sql \
         supabase/migrations/003_reconcile_worklog_types.sql; do
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$f"
done
```

## Phase 4 — Expose via Cloudflare Tunnel

The box is behind home NAT, so use a tunnel (no port-forwarding, free TLS, hides
your IP). See `infra/cloudflared/config.example.yml`. Map
`api.staging.paivy.fi → http://localhost:8000` (Kong). Realtime WebSockets pass
through. Put the hostname behind **Cloudflare Access** so staging isn't public,
and add Cloudflare **rate-limiting** rules on `/auth/v1/signup`,
`/auth/v1/token`, `/rest/v1/rpc/*` (self-hosting loses hosted Supabase's managed
auth rate limits).

## Phase 5 — Bootstrap + seed (synthetic only)

```sh
export SUPABASE_URL=https://api.staging.paivy.fi
export SERVICE_ROLE_KEY=...   POSTGRES_PASSWORD=...
ADMIN_EMAIL=you@paivy.fi ADMIN_PASSWORD='...' infra/scripts/bootstrap-admin.sh
infra/scripts/seed-staging.sh
```

> Do **not** load real employee PII onto the ThinkStation — it's a home box and a
> testing bed. Synthetic seed only.

## Phase 6 — Point the app at staging

Build a **staging** app profile with this env:
- `EXPO_PUBLIC_SUPABASE_URL=https://api.staging.paivy.fi`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>`

Use **EAS build profiles + channels** (staging vs production) and **EAS Update
(OTA)** so the later Hetzner cutover doesn't require an app-store release.

## Phase 7 — Backups + monitoring (rehearse on staging, real on prod)

- `infra/scripts/backup.sh` nightly (cron/systemd timer) → encrypted dump +
  retention + optional `rclone` off-site. **Test `restore.sh` end-to-end.**
- Monitoring: Uptime Kuma on `/auth/v1/health` with alerts; netdata or
  Prometheus+Grafana (node + postgres exporters); disk-space + container-health +
  failed-backup alerts.

---

## Hetzner production deltas

Same stack, same scripts. What changes:

| Concern | Hetzner production |
|---|---|
| Region | **Helsinki (hel1)** — EU/Finland data residency + low latency |
| Sizing | start ~CPX/CCX 8–16 GB RAM; resize as needed |
| Exposure | public IP → **Caddy/Traefik + Let's Encrypt**, kept behind the **Cloudflare proxy** for WAF + rate limits; or Cloudflare Tunnel as on staging |
| Firewall | Hetzner Cloud Firewall: 80/443 from Cloudflare only; SSH via Tailscale |
| Auth email | SMTP **required**; `ENABLE_EMAIL_AUTOCONFIRM=false` |
| Backups | snapshots **+** off-site (Storage Box / Backblaze B2) **+** consider PITR (pgBackRest / wal-g) |
| Secrets | a **fresh, different** secret set (`generate-secrets.sh` again) |
| Launch | fresh DB → apply `001`→`003` → `bootstrap-admin.sh` → real invites. No data migration (pre-launch). |

GDPR note: self-hosting makes you the data controller; Helsinki keeps employee
data in the EU. Document a data-retention + breach process before real users.

---

## Artifacts

| File | Purpose |
|---|---|
| `infra/scripts/generate-secrets.sh` | DB password, JWT secret, anon/service keys |
| `infra/docker/.env.template` | the overrides to merge into `supabase/docker/.env` |
| `infra/cloudflared/config.example.yml` | tunnel config (staging) |
| `infra/scripts/bootstrap-admin.sh` | first hr-admin on a fresh DB |
| `infra/scripts/seed-staging.sh` | synthetic users + data |
| `infra/scripts/backup.sh` / `restore.sh` | encrypted backup + restore |

> The scripts are syntax-checked but **not yet run against a live stack**. GoTrue
> env-var names and the admin-API payload are Supabase-version-sensitive — verify
> against the upstream `supabase/docker/.env.example` for your pinned version on
> first run (audit item #50: don't over-trust generated code).
