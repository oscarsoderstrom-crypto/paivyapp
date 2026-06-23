-- 004_time_tracking.sql
--
-- Adds optional working-time tracking, controlled org-wide by an HR admin.
-- When enabled, employees attach start/end times to their 'office' and 'home'
-- work-log days so working hours (and overtime) can be followed. When disabled,
-- the work log behaves as a plain location marker (the default).
--
-- Depends on 002 (audit_log). Idempotent where practical.

------------------------------------------------------------------
-- 1. app_settings — a single-row, org-wide configuration table.
--    Everyone authenticated may READ it (the app needs to know the mode);
--    only set_time_tracking() may change it.
------------------------------------------------------------------
create table if not exists public.app_settings (
  id                    boolean primary key default true,
  time_tracking_enabled boolean not null default false,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles(id),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true) on conflict do nothing;

alter table public.app_settings enable row level security;

revoke insert, update, delete on table public.app_settings from anon, authenticated;

drop policy if exists "settings_read" on public.app_settings;
create policy "settings_read" on public.app_settings
  for select to authenticated using (true);

-- Let employees' apps react live when HR flips the switch.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.app_settings;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

------------------------------------------------------------------
-- 2. work_logs — optional clock-in / clock-out times.
--    These live on the user's own row, so the existing logs_insert/
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
-- 3. set_time_tracking() — the only way to change the org setting.
--    hr-admin only; audited.
------------------------------------------------------------------
create or replace function public.set_time_tracking(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles%rowtype;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then raise exception 'not authenticated'; end if;
  if v_me.role <> 'hr-admin' then
    raise exception 'only an HR admin can change time tracking';
  end if;

  update public.app_settings
  set time_tracking_enabled = p_enabled,
      updated_at = now(),
      updated_by = v_me.id
  where id = true;

  insert into public.audit_log (actor, action, target, details)
  values (v_me.id, 'settings.time_tracking', v_me.id,
          jsonb_build_object('enabled', p_enabled));
end;
$$;

revoke execute on function public.set_time_tracking(boolean) from public, anon;
grant execute on function public.set_time_tracking(boolean) to authenticated;
