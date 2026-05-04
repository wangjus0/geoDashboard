revoke all on table public.dashboard_access_users from anon, authenticated;
revoke all on table public.dashboard_login_codes from anon, authenticated;

grant select, insert, update on table public.dashboard_access_users to geo_dashboard_app;
grant select, insert, update on table public.dashboard_login_codes to geo_dashboard_app;
