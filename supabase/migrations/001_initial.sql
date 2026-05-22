create extension if not exists "uuid-ossp";

create table teams (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  color      text not null default '#1565C0',
  created_at timestamptz default now()
);

insert into teams (name, color) values
  ('Marketing',   '#C2185B'),
  ('Engineering', '#1565C0'),
  ('Design',      '#E65100');

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  role         text not null default 'employee'
               check (role in ('employee','manager','hr-admin')),
  team_id      uuid references teams(id),
  accrual_rate numeric not null default 2.5,
  created_at   timestamptz default now()
);

create table work_logs (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  date       date not null,
  type       text not null check (type in
             ('office','home','vac-paid','vac-unpaid','sick','trip-dom','trip-int')),
  notes      text,
  created_at timestamptz default now(),
  unique (user_id, date)
);

create table vacation_requests (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  type         text not null default 'paid' check (type in ('paid','unpaid')),
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected')),
  reviewed_by  uuid references profiles(id),
  reviewed_at  timestamptz,
  notes        text,
  created_at   timestamptz default now()
);

create table invitations (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null unique,
  invited_by  uuid references profiles(id),
  team_id     uuid references teams(id),
  role        text not null default 'employee',
  token       text not null unique default encode(gen_random_bytes(32), 'hex'),
  accepted_at timestamptz,
  expires_at  timestamptz default (now() + interval '7 days'),
  created_at  timestamptz default now()
);

alter table profiles          enable row level security;
alter table work_logs         enable row level security;
alter table vacation_requests enable row level security;
alter table invitations       enable row level security;
alter table teams             enable row level security;

create policy "teams_read"  on teams for select to authenticated using (true);
create policy "teams_write" on teams for all    to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'hr-admin'));

create policy "profiles_read"   on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles_update" on profiles for update to authenticated
  using (id = auth.uid() or exists (
    select 1 from profiles where id = auth.uid() and role in ('manager','hr-admin')));

create policy "logs_select" on work_logs for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from profiles p join profiles me on me.id = auth.uid()
    where p.id = work_logs.user_id
    and (me.role = 'hr-admin' or (me.role = 'manager' and me.team_id = p.team_id))));
create policy "logs_insert" on work_logs for insert to authenticated
  with check (user_id = auth.uid());
create policy "logs_update" on work_logs for update to authenticated
  using (user_id = auth.uid());
create policy "logs_delete" on work_logs for delete to authenticated
  using (user_id = auth.uid());

create policy "vac_select" on vacation_requests for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from profiles p join profiles me on me.id = auth.uid()
    where p.id = vacation_requests.user_id
    and (me.role = 'hr-admin' or me.team_id = p.team_id)));
create policy "vac_insert" on vacation_requests for insert to authenticated
  with check (user_id = auth.uid());
create policy "vac_update" on vacation_requests for update to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from profiles where id = auth.uid() and role in ('manager','hr-admin')));

create policy "inv_select" on invitations for select to authenticated
  using (exists (
    select 1 from profiles where id = auth.uid() and role in ('manager','hr-admin')));
create policy "inv_insert" on invitations for insert to authenticated
  with check (exists (
    select 1 from profiles where id = auth.uid() and role in ('manager','hr-admin')));

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
