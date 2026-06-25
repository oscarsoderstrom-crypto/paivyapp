# Migrating the backend to a Hetzner server

This is a planning document for moving Päivy's backend off hosted Supabase
(`supabase.com`) onto a server you control at Hetzner. It is **not yet implemented** —
it describes the recommended approach, the steps, and the trade-offs.

---

## TL;DR recommendation

**Self-host the full Supabase stack via Docker Compose on a Hetzner Cloud VPS.**

This keeps the app architecture identical to today (Postgres + GoTrue auth + PostgREST +
Realtime + Storage behind the Kong gateway), so the **only app change is swapping two
env vars**:

```
EXPO_PUBLIC_SUPABASE_URL       → https://api.yourdomain.com
EXPO_PUBLIC_SUPABASE_ANON_KEY  → <new anon key signed by your new JWT secret>
```

Everything else — `lib/supabase.ts`, the RLS policies in `001`/`002`, the `@supabase/supabase-js`
client calls in every screen — works unchanged.

### Why not the alternatives?

| Option | Verdict |
|---|---|
| **Self-hosted Supabase (Docker Compose)** ✅ | Closest to current setup, near-zero app changes, keeps RLS + auth. You own ops. **Recommended.** |
| Managed Postgres + hand-rolled REST/auth API | Large rewrite (replace PostgREST + GoTrue + RLS-as-auth). Only worth it if you're leaving the Supabase model entirely. |
| Hetzner Managed Postgres only, keep Supabase auth | Splits the stack across two providers; auth still tied to Supabase. Not a real migration. |

---

## 1. Provision the server

- **Hetzner Cloud VPS**: start with **CPX31** (4 vCPU / 8 GB RAM / 160 GB NVMe) — the
  Supabase stack (7–8 containers) needs ~4 GB comfortably. CX/CPX line, Ubuntu 24.04 LTS.
- Attach a **Hetzner Volume** for the Postgres data directory so you can resize/snapshot
  storage independently of the VM.
- Create the box via the Hetzner Console or `hcloud` CLI; add your SSH key, disable
  password login.
- **Firewall** (Hetzner Cloud Firewall + `ufw`): allow only `22` (SSH, ideally
  IP-restricted), `80`, `443`. Postgres `5432` stays **closed** to the internet — access
  it via SSH tunnel only.
- **DNS**: point `api.yourdomain.com` (and optionally `studio.yourdomain.com`) at the
  server's IPv4/IPv6.

## 2. TLS + reverse proxy

- Put **Caddy** (simplest — automatic Let's Encrypt) or Traefik in front of the Supabase
  **Kong** gateway (Kong listens on `:8000`).
- Caddy terminates TLS for `api.yourdomain.com` and reverse-proxies to `kong:8000`.
- Protect Studio (`:3000`) behind basic-auth or a VPN/Tailscale — never expose it openly.

## 3. The Docker Compose stack

Use the official self-hosting compose as the base:
`https://github.com/supabase/supabase/tree/master/docker`.

Services: `db` (postgres), `auth` (GoTrue), `rest` (PostgREST), `realtime`, `storage`,
`imgproxy`, `kong`, `studio`, `meta`, `vector`/analytics (optional, can drop to save RAM).

Key `.env` values to generate fresh (do **not** reuse hosted-Supabase secrets):
- `POSTGRES_PASSWORD`
- `JWT_SECRET` (≥ 32 chars) — then derive `ANON_KEY` and `SERVICE_ROLE_KEY` as JWTs signed
  with it (use the Supabase JWT generator or `jsonwebtoken`).
- `SITE_URL` / `ADDITIONAL_REDIRECT_URLS` — must include the app's auth redirect/deep-link
  (`paivy://` scheme or your Expo redirect) so email/magic-link auth resolves correctly.
- `API_EXTERNAL_URL=https://api.yourdomain.com`.
- SMTP settings (GoTrue needs a real SMTP provider for signup/reset emails — e.g.
  Postmark/Resend/SES, since Hetzner blocks outbound port 25).

## 4. Migrate the data

1. **Schema**: apply `supabase/migrations/001_initial.sql` then
   `supabase/migrations/002_work_hours.sql` to the new `db`. (002 is idempotent and also
   reconciles the `workweek` / `off` drift, so the new DB ends up clean.)
2. **Auth users**: dump and restore the `auth` schema from the old project so existing
   logins keep working:
   ```bash
   pg_dump "$OLD_DB_URL" --schema=auth --data-only --no-owner > auth.sql
   psql "$NEW_DB_URL" < auth.sql
   ```
   Connect to the source via Supabase → Project Settings → Database (direct connection
   string / use the connection pooler in `session` mode).
3. **App data**: dump `public` data only (schema already created by the migrations):
   ```bash
   pg_dump "$OLD_DB_URL" --schema=public --data-only --no-owner \
     --exclude-table-data='public.schema_migrations' > public.sql
   psql "$NEW_DB_URL" < public.sql
   ```
4. **Storage objects** (only if you start using Storage buckets — currently the app does
   not): mirror the `storage` schema rows + copy the underlying objects.
5. **Verify RLS**: confirm every policy from `001` exists on the new DB
   (`select * from pg_policies`) and that `auth.uid()` resolves — RLS is your entire
   authorization model, so test it explicitly with a non-admin token.

## 5. App-side cutover

- Update the two `EXPO_PUBLIC_SUPABASE_*` env vars (in `.env` / EAS secrets) to the new
  URL + anon key. No code edits — `lib/supabase.ts` reads them at build time.
- Confirm auth deep-link / redirect URLs match `SITE_URL`/`ADDITIONAL_REDIRECT_URLS`.
- Ship a new build (or EAS Update if the URL is read at runtime) and smoke-test:
  login → fetch profile → mark a day → HR settings write → realtime if used.

## 6. Ops you now own

Self-hosting moves these responsibilities from Supabase to you:

- **Backups**: nightly `pg_dump` (or `pgBackRest`/WAL-G) to **Hetzner Object Storage** or
  an offsite bucket; test restores. Plus Hetzner volume snapshots.
- **Monitoring/alerting**: container health, disk, CPU/RAM (Uptime Kuma / Grafana +
  Prometheus / Hetzner metrics).
- **Security patching**: OS updates, Docker image bumps, rotating the JWT secret means
  re-issuing the anon key and shipping a new app build — plan for it.
- **Upgrades**: pin Supabase image versions; upgrade deliberately and test, since there's
  no managed upgrade path.
- **High availability**: a single VPS is a single point of failure. If uptime matters,
  budget for a standby/replica and a documented restore runbook.

## 7. Rough cost & effort

- **Cost**: CPX31 (~€15/mo) + volume + object storage for backups ≈ **€20–25/mo**, vs.
  Supabase Pro at $25/mo — similar money, but you trade managed convenience for control.
- **Effort**: ~1–2 days for first stand-up + data migration + cutover testing, then
  ongoing maintenance time you didn't have before.

## Open questions before doing this

- Is leaving hosted Supabase driven by **cost**, **data residency** (EU/Hetzner), or
  **control**? Data residency is the strongest reason — Supabase also offers EU regions,
  so confirm self-hosting is actually required.
- Do you need Realtime / Storage now or soon? It changes the stack you must operate.
- Who owns on-call when the single VPS goes down at 2am?
