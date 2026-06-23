-- 003_reconcile_worklog_types.sql
--
-- Reconciles schema drift found in the audit: the app's DayTypeId includes
-- 'off' (added with the per-user workweek feature) but the work_logs CHECK
-- constraint from 001_initial.sql never allowed it, so logging a day as
-- 'off' was silently rejected by the database. Idempotent and independent
-- of 002 — safe to run on its own.
alter table public.work_logs drop constraint if exists work_logs_type_check;

alter table public.work_logs
  add constraint work_logs_type_check check (type in
    ('office','home','vac-paid','vac-unpaid','sick','trip-dom','trip-int','off'));
