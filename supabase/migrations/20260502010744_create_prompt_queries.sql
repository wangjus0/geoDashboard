create table if not exists public.prompt_queries (
  id text primary key,
  query_text text not null,
  queried_at timestamptz not null default now(),
  models jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint prompt_queries_models_array check (jsonb_typeof(models) = 'array'),
  constraint prompt_queries_results_array check (jsonb_typeof(results) = 'array')
);

create index if not exists prompt_queries_queried_at_idx
  on public.prompt_queries (queried_at desc);

alter table public.prompt_queries enable row level security;

drop policy if exists "No direct client access" on public.prompt_queries;

create policy "No direct client access"
  on public.prompt_queries
  for all
  to anon, authenticated
  using (false)
  with check (false);
