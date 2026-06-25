-- 002_work_hours.sql
-- Adds per-user work-hours configuration + per-day time stamps.
-- Written idempotently so it is safe to re-run, and reconciles earlier
-- dashboard-only drift (profiles.workweek, the 'off' work_log type).

-- ── profiles: work-hours config ──────────────────────────────────────────────
alter table profiles
  add column if not exists hours_mode      text not null default 'set'
    check (hours_mode in ('set','rolling'));
alter table profiles
  add column if not exists workday_minutes int  not null default 480;  -- presence incl. lunch (8h)
alter table profiles
  add column if not exists lunch_minutes   int  not null default 30;   -- unpaid lunch

-- Drift reconciliation: workweek was applied straight to the dashboard in an
-- earlier change and never captured in a migration file.
alter table profiles
  add column if not exists workweek text not null default 'mon-fri'
    check (workweek in ('mon-fri','mon-sun'));

-- ── work_logs: per-day time stamps ───────────────────────────────────────────
alter table work_logs add column if not exists started_at     timestamptz;
alter table work_logs add column if not exists ended_at       timestamptz;
alter table work_logs add column if not exists worked_minutes int;

-- Drift reconciliation: the 'off' day type is used by the app/DB but the
-- original check constraint omitted it. Replace it with the full set.
alter table work_logs drop constraint if exists work_logs_type_check;
alter table work_logs add  constraint work_logs_type_check check (type in
  ('office','home','vac-paid','vac-unpaid','sick','trip-dom','trip-int','off'));
