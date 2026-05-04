create table if not exists public.tracked_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_text text not null unique,
  models jsonb not null default '["chatgpt", "claude", "gemini"]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracked_prompts_models_array check (jsonb_typeof(models) = 'array')
);

create table if not exists public.daily_tracking_runs (
  id uuid primary key default gen_random_uuid(),
  tracked_prompt_id uuid not null references public.tracked_prompts(id) on delete cascade,
  run_date date not null,
  prompt_query_id text references public.prompt_queries(id) on delete set null,
  status text not null default 'pending',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_tracking_runs_status check (status in ('pending', 'running', 'completed', 'failed')),
  constraint daily_tracking_runs_unique_prompt_day unique (tracked_prompt_id, run_date)
);

create index if not exists tracked_prompts_active_created_at_idx
  on public.tracked_prompts (is_active, created_at);

create index if not exists daily_tracking_runs_run_date_idx
  on public.daily_tracking_runs (run_date desc);

create index if not exists daily_tracking_runs_status_idx
  on public.daily_tracking_runs (status);

alter table public.tracked_prompts enable row level security;
alter table public.daily_tracking_runs enable row level security;

drop policy if exists "No direct client access" on public.tracked_prompts;
drop policy if exists "No direct client access" on public.daily_tracking_runs;
drop policy if exists "Backend app can read tracked prompts" on public.tracked_prompts;
drop policy if exists "Backend app can read daily tracking runs" on public.daily_tracking_runs;
drop policy if exists "Backend app can insert daily tracking runs" on public.daily_tracking_runs;
drop policy if exists "Backend app can update daily tracking runs" on public.daily_tracking_runs;

create policy "No direct client access"
  on public.tracked_prompts
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "No direct client access"
  on public.daily_tracking_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "Backend app can read tracked prompts"
  on public.tracked_prompts
  for select
  to geo_dashboard_app
  using (true);

create policy "Backend app can read daily tracking runs"
  on public.daily_tracking_runs
  for select
  to geo_dashboard_app
  using (true);

create policy "Backend app can insert daily tracking runs"
  on public.daily_tracking_runs
  for insert
  to geo_dashboard_app
  with check (true);

create policy "Backend app can update daily tracking runs"
  on public.daily_tracking_runs
  for update
  to geo_dashboard_app
  using (true)
  with check (true);

grant select on table public.tracked_prompts to geo_dashboard_app;
grant select, insert, update on table public.daily_tracking_runs to geo_dashboard_app;

insert into public.tracked_prompts (prompt_text, models, is_active)
values
  ('best marketing agency solutions for local visibility', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('top media marketing agencies for brand visibility', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('best marketing agency solutions for small businesses', '["chatgpt", "claude", "gemini"]'::jsonb, true)
on conflict (prompt_text) do update
set
  models = excluded.models,
  is_active = true,
  updated_at = now();
