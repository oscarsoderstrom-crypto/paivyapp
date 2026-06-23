-- 002_security_fixes.sql
--
-- Closes the privilege-escalation and authorization holes found in the
-- security audit:
--   C1  any user could set their own role to 'hr-admin' via profiles UPDATE
--   C2  any user could approve their own vacation request via direct UPDATE
--   C3  invite validation lived entirely in the client; signUp was open
--   C4  invitations were never marked accepted (no UPDATE policy), so codes
--       were reusable forever
--
-- Apply to the live project with `supabase db push` (or the SQL editor).
-- After applying, also check the dashboard for any extra policies on
-- `invitations` that were added manually — the committed schema cannot
-- remove policies it doesn't know about.

------------------------------------------------------------------
-- 0. Reconcile schema drift: `workweek` existed only in the live DB
------------------------------------------------------------------
alter table public.profiles
  add column if not exists workweek text not null default 'mon-fri';

do $$
begin
  alter table public.profiles
    add constraint profiles_workweek_check check (workweek in ('mon-fri','mon-sun'));
exception when duplicate_object then null;
end $$;

------------------------------------------------------------------
-- 1. Audit log — written only by the security-definer functions below
------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  target     uuid,
  details    jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;

create policy "audit_select_hr" on public.audit_log for select to authenticated
  using (exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'hr-admin'));

------------------------------------------------------------------
-- 2. profiles: users may edit only their own full_name / workweek.
--    role, team_id and accrual_rate change only through
--    admin_update_profile(). Rows are created only by the signup trigger.
------------------------------------------------------------------
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;

revoke insert, update, delete on table public.profiles from anon, authenticated;
grant update (full_name, workweek) on table public.profiles to authenticated;

create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

------------------------------------------------------------------
-- 3. vacation_requests: owners manage only their own *pending* requests
--    and can never touch status/reviewed_by. Review happens only through
--    approve_vacation().
------------------------------------------------------------------
drop policy if exists "vac_insert" on public.vacation_requests;
drop policy if exists "vac_update" on public.vacation_requests;

create policy "vac_insert_own_pending" on public.vacation_requests
  for insert to authenticated
  with check (user_id = auth.uid()
              and status = 'pending'
              and reviewed_by is null
              and reviewed_at is null);

create policy "vac_update_own_pending" on public.vacation_requests
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid()
              and status = 'pending'
              and reviewed_by is null);

create policy "vac_delete_own_pending" on public.vacation_requests
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- NOT VALID so it applies to new rows without failing on legacy data
do $$
begin
  alter table public.vacation_requests
    add constraint vacation_requests_dates_check
    check (end_date >= start_date) not valid;
exception when duplicate_object then null;
end $$;

------------------------------------------------------------------
-- 4. invitations: hr-admin only, single-use, no client-supplied tokens,
--    no hr-admin invites (promotion goes through admin_update_profile).
------------------------------------------------------------------
drop policy if exists "inv_select" on public.invitations;
drop policy if exists "inv_insert" on public.invitations;

revoke insert, update, delete on table public.invitations from anon, authenticated;
grant insert (email, invited_by, team_id, role) on table public.invitations
  to authenticated;

create policy "inv_select_hr" on public.invitations for select to authenticated
  using (exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'hr-admin'));

create policy "inv_insert_hr" on public.invitations for insert to authenticated
  with check (invited_by = auth.uid()
              and exists (select 1 from public.profiles
                          where id = auth.uid() and role = 'hr-admin'));

grant delete on table public.invitations to authenticated;
create policy "inv_delete_hr" on public.invitations for delete to authenticated
  using (exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'hr-admin'));

do $$
begin
  alter table public.invitations
    add constraint invitations_role_check
    check (role in ('employee','manager')) not valid;
exception when duplicate_object then null;
end $$;

-- Allow re-inviting an email once the previous invite is consumed
alter table public.invitations drop constraint if exists invitations_email_key;
create unique index if not exists invitations_email_pending_key
  on public.invitations (email) where accepted_at is null;

------------------------------------------------------------------
-- 5. Signup is now invite-gated server-side. The client passes the invite
--    code in auth metadata; without a matching, unexpired, unaccepted
--    invitation the auth.users insert aborts and no account is created.
--    NOTE: creating users from the Supabase dashboard now also requires a
--    pending invitation for that email.
------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code   text;
  v_invite public.invitations%rowtype;
begin
  v_code := lower(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));

  if char_length(v_code) < 8 then
    raise exception 'signup requires a valid invite code';
  end if;

  select * into v_invite
  from public.invitations i
  where i.email = lower(new.email)
    and i.accepted_at is null
    and i.expires_at > now()
    and starts_with(i.token, v_code)
  order by i.created_at desc
  limit 1;

  if v_invite.id is null then
    raise exception 'signup requires a valid invite code';
  end if;

  insert into public.profiles (id, email, full_name, role, team_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_invite.role,
    v_invite.team_id
  );

  update public.invitations
  set accepted_at = now()
  where id = v_invite.id;

  insert into public.audit_log (actor, action, target, details)
  values (new.id, 'user.signup_via_invite', new.id,
          jsonb_build_object('invitation_id', v_invite.id, 'role', v_invite.role));

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

------------------------------------------------------------------
-- 6. approve_vacation(): the only way to review a request.
--    hr-admin reviews anyone; a manager reviews only their own team;
--    nobody reviews their own request.
------------------------------------------------------------------
create or replace function public.approve_vacation(p_request_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me         public.profiles%rowtype;
  v_req        public.vacation_requests%rowtype;
  v_owner_team uuid;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then raise exception 'not authenticated'; end if;

  select * into v_req from public.vacation_requests where id = p_request_id;
  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'request has already been reviewed'; end if;
  if v_req.user_id = v_me.id then raise exception 'cannot review your own request'; end if;

  select team_id into v_owner_team from public.profiles where id = v_req.user_id;

  if not (v_me.role = 'hr-admin'
          or (v_me.role = 'manager'
              and v_me.team_id is not null
              and v_me.team_id = v_owner_team)) then
    raise exception 'not authorized to review vacation requests';
  end if;

  update public.vacation_requests
  set status = p_decision, reviewed_by = v_me.id, reviewed_at = now()
  where id = p_request_id;

  insert into public.audit_log (actor, action, target, details)
  values (v_me.id, 'vacation.' || p_decision, v_req.user_id,
          jsonb_build_object('request_id', p_request_id,
                             'start_date', v_req.start_date,
                             'end_date', v_req.end_date));
end;
$$;

revoke execute on function public.approve_vacation(uuid, text) from public, anon;
grant execute on function public.approve_vacation(uuid, text) to authenticated;

------------------------------------------------------------------
-- 7. admin_update_profile(): the only way to change role / team /
--    accrual / workweek for another user. hr-admin manages anyone;
--    a manager manages only their own team and never roles.
------------------------------------------------------------------
create or replace function public.admin_update_profile(
  p_user_id  uuid,
  p_role     text    default null,
  p_team_id  uuid    default null,
  p_accrual  numeric default null,
  p_workweek text    default null
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
    raise exception 'not authorized to manage profiles';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if v_target.id is null then raise exception 'profile not found'; end if;

  if v_me.role = 'manager' then
    if p_role is not null then
      raise exception 'only an HR admin can change roles';
    end if;
    if v_me.team_id is null or v_target.team_id is distinct from v_me.team_id then
      raise exception 'managers can only manage their own team';
    end if;
  end if;

  if p_role is not null then
    if p_role not in ('employee','manager','hr-admin') then
      raise exception 'invalid role';
    end if;
    if v_target.role = 'hr-admin' and p_role <> 'hr-admin'
       and (select count(*) from public.profiles where role = 'hr-admin') <= 1 then
      raise exception 'cannot demote the last HR admin';
    end if;
  end if;

  if p_accrual is not null and (p_accrual <= 0 or p_accrual > 31) then
    raise exception 'invalid accrual rate';
  end if;
  if p_workweek is not null and p_workweek not in ('mon-fri','mon-sun') then
    raise exception 'invalid workweek';
  end if;
  if p_team_id is not null
     and not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'invalid team';
  end if;

  update public.profiles set
    role         = coalesce(p_role, role),
    team_id      = coalesce(p_team_id, team_id),
    accrual_rate = coalesce(p_accrual, accrual_rate),
    workweek     = coalesce(p_workweek, workweek)
  where id = p_user_id;

  insert into public.audit_log (actor, action, target, details)
  values (v_me.id, 'profile.admin_update', p_user_id,
          jsonb_build_object('role', p_role, 'team_id', p_team_id,
                             'accrual_rate', p_accrual, 'workweek', p_workweek));
end;
$$;

revoke execute on function public.admin_update_profile(uuid, text, uuid, numeric, text)
  from public, anon;
grant execute on function public.admin_update_profile(uuid, text, uuid, numeric, text)
  to authenticated;
