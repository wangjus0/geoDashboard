create table if not exists public.dashboard_access_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  role text not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_access_users_email_lowercase check (email = lower(email)),
  constraint dashboard_access_users_email_unique unique (email),
  constraint dashboard_access_users_role check (role in ('admin', 'viewer'))
);

create table if not exists public.dashboard_login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  constraint dashboard_login_codes_email_lowercase check (email = lower(email)),
  constraint dashboard_login_codes_attempts check (attempts >= 0 and attempts <= 10)
);

create index if not exists dashboard_access_users_active_email_idx
  on public.dashboard_access_users (is_active, email);

create index if not exists dashboard_login_codes_email_created_at_idx
  on public.dashboard_login_codes (email, created_at desc);

create index if not exists dashboard_login_codes_expires_at_idx
  on public.dashboard_login_codes (expires_at);

alter table public.dashboard_access_users enable row level security;
alter table public.dashboard_login_codes enable row level security;

drop policy if exists "No direct client access" on public.dashboard_access_users;
drop policy if exists "No direct client access" on public.dashboard_login_codes;
drop policy if exists "Backend app can manage dashboard access users" on public.dashboard_access_users;
drop policy if exists "Backend app can manage dashboard login codes" on public.dashboard_login_codes;

create policy "No direct client access"
  on public.dashboard_access_users
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "No direct client access"
  on public.dashboard_login_codes
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "Backend app can manage dashboard access users"
  on public.dashboard_access_users
  for all
  to geo_dashboard_app
  using (true)
  with check (true);

create policy "Backend app can manage dashboard login codes"
  on public.dashboard_login_codes
  for all
  to geo_dashboard_app
  using (true)
  with check (true);

grant select, insert, update on table public.dashboard_access_users to geo_dashboard_app;
grant select, insert, update on table public.dashboard_login_codes to geo_dashboard_app;
