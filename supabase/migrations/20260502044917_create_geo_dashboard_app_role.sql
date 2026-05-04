do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'geo_dashboard_app') then
    create role geo_dashboard_app login;
  end if;
end
$$;

grant usage on schema public to geo_dashboard_app;
grant select, insert on table public.prompt_queries to geo_dashboard_app;

alter table public.prompt_queries enable row level security;

drop policy if exists "Backend app can read prompt queries" on public.prompt_queries;
drop policy if exists "Backend app can insert prompt queries" on public.prompt_queries;

create policy "Backend app can read prompt queries"
  on public.prompt_queries
  for select
  to geo_dashboard_app
  using (true);

create policy "Backend app can insert prompt queries"
  on public.prompt_queries
  for insert
  to geo_dashboard_app
  with check (true);
