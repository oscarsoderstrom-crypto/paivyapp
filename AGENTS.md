# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

# Security rules (non-negotiable)

This is a multi-tenant app where the only backend is Supabase, reached
directly from the client with the public anon key. The client is therefore
untrusted — all real security lives in the database.

- **Authorize in the database, never only in the client.** UI checks
  (hiding a button, `if (role === 'hr-admin')`) are cosmetic. Every table
  has RLS enabled; every privileged action (role/team/accrual changes,
  approving requests, consuming invitations) goes through a
  `security definer` RPC that re-checks the caller's identity and role.
  Never grant blanket `update`/`insert` on sensitive columns — use
  column-level grants and RPCs.
- **Never trust client-supplied identity or role.** Derive `auth.uid()`
  server-side; do not accept a user id, role, or status from the request
  body for authorization decisions.
- **Never ship secrets to the client.** Don't `select('*')` on tables that
  hold secrets (e.g. invitation `token`s). Only `EXPO_PUBLIC_*` (public,
  RLS-protected) values may reach the bundle. Never hardcode keys; never
  commit `.env`. The service_role key must never appear in app code.
- **All schema changes are versioned migrations** under
  `supabase/migrations/` — never dashboard-only. Keep migrations, the
  TypeScript types in `lib/types.ts`, and the code in sync; drift is a bug.
- **Check every Supabase `error`** and surface failures to the user. Do not
  swallow errors, and do not log full error objects, tokens, emails, or
  user data to the console.
- **Set `search_path = ''`** on every `security definer` function and
  schema-qualify all references.
- Run `/security-review` on any branch that touches auth, RLS, migrations,
  invitations, or storage before merging. Keep GitHub secret scanning and
  push protection enabled on the repo.
