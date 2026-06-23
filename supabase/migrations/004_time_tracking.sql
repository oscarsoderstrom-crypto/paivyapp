-- 004_time_tracking.sql
--
-- Per-employee working-time tracking. Each employee is in one of two modes,
-- chosen by an HR admin (or their team manager):
--   * whole-day  (track_hours = false, the default): pressing In Office / Work
--     from Home logs a full standard day (daily_hours); no clock in/out.
--   * track-hours (track_hours = true): the employee clocks in (start_time is
--     stamped when they press In Office / Work from Home) and presses
--     End Workday (end_time) when they finish; actual hours and overtime are
--     derived from the two timestamps.
--
-- HR admins / managers follow overtime at the employee, team and organization
-- level by reading work_logs (already permitted by the logs_select policy from
-- 001/002: hr-admin sees everyone, a manager sees their own team).
--
-- Depends on 002 (audit_log, profiles grants). Idempotent.

-- Remove the earlier org-wide design if it was ever applied (superseded by the
-- per-employee model below).
drop function if exists public.set_time_tracking(boolean);
drop table if exists public.app_settings;

------------------------------------------------------------------
-- 1. Per-employee configuration on profiles.
--    These columns are NOT in the self-service column grant from 002
--    (which only allows full_name/workweek), so an employee cannot change
--    their own mode — only set_work_tracking() can.
------------------------------------------------------------------
alter table public.profiles
  add column if not exists track_hours boolean not null default false,
  add column if not exists daily_hours numeric not null default 7.5;

do $$
begin
  alter table public.profiles
    add constraint profiles_daily_hours_check
    check (daily_hours > 0 and daily_hours <= 24);
exception when duplicate_object then null;
end $$;

------------------------------------------------------------------
-- 2. Clock-in / clock-out times on the day's work log.
--    They live on the user's own row, so the existing logs_insert /
--    logs_update policies already authorize them; no new grants needed.
------------------------------------------------------------------
alter table public.work_logs
  add column if not exists start_time time,
  add column if not exists end_time   time;

do $$
begin
  alter table public.work_logs
    add constraint work_logs_time_order check (
      start_time is null or end_time is null or end_time > start_time
    ) not valid;
exception when duplicate_object then null;
end $$;

------------------------------------------------------------------
-- 3. set_work_tracking() — the only way to change an employee's tracking
--    mode / daily hours. hr-admin may set anyone; a manager may set members
--    of their own team. Audited.
------------------------------------------------------------------
create or replace function public.set_work_tracking(
  p_user_id     uuid,
  p_track_hours boolean,
  p_daily_hours numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then raise exception 'not authenticated'; end if;
  if v_me.role not in ('manager','hr-admin') then
    raise exception 'not authorized to change work tracking';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if v_target.id is null then raise exception 'profile not found'; end if;

  if v_me.role = 'manager'
     and (v_me.team_id is null or v_target.team_id is distinct from v_me.team_id) then
    raise exception 'managers can only manage their own team';
  end if;

  if p_daily_hours is not null and (p_daily_hours <= 0 or p_daily_hours > 24) then
    raise exception 'invalid daily hours';
  end if;

  update public.profiles set
    track_hours = p_track_hours,
    daily_hours = coalesce(p_daily_hours, daily_hours)
  where id = p_user_id;

  insert into public.audit_log (actor, action, target, details)
  values (v_me.id, 'profile.work_tracking', p_user_id,
          jsonb_build_object('track_hours', p_track_hours, 'daily_hours', p_daily_hours));
end;
$$;

revoke execute on function public.set_work_tracking(uuid, boolean, numeric) from public, anon;
grant execute on function public.set_work_tracking(uuid, boolean, numeric) to authenticated;
