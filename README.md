# Geo Dashboard

This repository deploys as a single Vercel project containing both the frontend and backend.

## Project Layout

- `src`: Vite + React frontend
- `api/[...route].ts`: Vercel serverless function entrypoint
- `backend/src`: Express app and API logic

## Local Development

Install dependencies:

```bash
npm install
```

Run frontend and backend in separate terminals:

```bash
npm run dev
npm run dev:api
```

Frontend defaults to `http://localhost:5173` and backend to `http://localhost:3000`.

## Supabase Azure OAuth Authentication Setup

The recommended access model is Supabase Auth Azure OAuth with a company-domain gate. Users sign in with Microsoft, Supabase completes the Azure provider flow, and the backend only creates a signed dashboard session after verifying the Supabase session and checking the configured email domains.

The old magic-link and one-time-code paths remain available for rollback with `AUTH_METHOD=supabase_magic_link` or `AUTH_METHOD=email_code`, but production should use `AUTH_METHOD=azure_oauth`.

Set these variables before running locally or deploying:

```bash
# backend (backend/.env)
SESSION_SECRET=a-long-random-secret
CORS_ORIGINS=http://localhost:5173
AUTH_METHOD=azure_oauth
ALLOWED_EMAIL_DOMAINS=arkmarketing.com,arcmarketing.com
DASHBOARD_ADMIN_EMAILS=audrey@arkmarketing.com
SUPABASE_URL=https://usgsllxucjzmksnsdnfy.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
PUBLIC_APP_URL=http://localhost:5173
```

`ALLOWED_EMAIL_DOMAINS` is a comma-separated company domain list. Any Microsoft-authenticated user with one of those email domains can access the dashboard. `DASHBOARD_ADMIN_EMAILS` is separate and only controls admin privileges after sign-in.

In Supabase Dashboard > Authentication > Providers > Azure, enable Azure and set the Microsoft app client ID, secret value, and tenant URL `https://login.microsoftonline.com/862026b2-1235-46fa-8934-00c08b207aff`. The Microsoft app registration redirect URI must be `https://usgsllxucjzmksnsdnfy.supabase.co/auth/v1/callback`. In Supabase Authentication > URL Configuration, set the production Site URL and add redirect URLs for local and production, including `http://localhost:5173/` and `https://geo-dashboard-black.vercel.app/`.

For fully local tracking that does not require Supabase or provider API calls, also set:

```bash
QUERY_STORE_DRIVER=local
MODEL_SCAN_MODE=mock
```

`QUERY_STORE_DRIVER=local` stores dashboard history in `backend/data/query-store.json`.

## Supabase Database Setup

Database schema changes live in `supabase/migrations/`.

Supabase project:

- Project name: `geo-dashboard`
- Project ref: `usgsllxucjzmksnsdnfy`
- API URL: `https://usgsllxucjzmksnsdnfy.supabase.co`

The dashboard stores scan history in `public.prompt_queries`. Apply the migrations to the linked Supabase project, then set the backend Postgres connection string from Supabase Dashboard > Project Settings > Database > Connection string:

```bash
DATABASE_URL=postgresql://...
QUERY_STORE_DRIVER=postgres
MODEL_SCAN_MODE=live
```

The Supabase API URL is not a Postgres connection string and should not be used as `DATABASE_URL`.

The `prompt_queries` table has RLS enabled with direct client access denied. The Express backend writes through the configured `DATABASE_URL`.

For local development and serverless deployment, use the IPv4 pooler connection with the dedicated app role:

```bash
DATABASE_URL=postgresql://geo_dashboard_app.usgsllxucjzmksnsdnfy:<password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

## Vercel Deployment

Create one Vercel project named `geo-dashboard` with this repository root as the project root.

- Build command: `npm run build`
- Output directory: `dist`

Set these production environment variables in Vercel:

```bash
VITE_API_BASE_URL=
DATABASE_URL=
QUERY_STORE_DRIVER=postgres
MODEL_SCAN_MODE=live
CRON_SECRET=
DAILY_TRACKING_PROMPT_LIMIT=25
SESSION_SECRET=
AUTH_METHOD=azure_oauth
ALLOWED_EMAIL_DOMAINS=arkmarketing.com,arcmarketing.com
DASHBOARD_ADMIN_EMAILS=audrey@arkmarketing.com
SUPABASE_URL=https://usgsllxucjzmksnsdnfy.supabase.co
SUPABASE_PUBLISHABLE_KEY=
PUBLIC_APP_URL=https://geo-dashboard-black.vercel.app
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
CORS_ORIGINS=https://geo-dashboard-black.vercel.app
```

Leave `VITE_API_BASE_URL` empty to use same-origin API routes (`/api/*`) in production.

The project includes Vercel Cron jobs for daily tracking. Vercel schedules are UTC-only, so the endpoint is invoked at both possible UTC hours for 8 AM Pacific and runs only during the `America/Los_Angeles` 8 AM hour:

```json
[
  { "path": "/api/cron/daily-scan", "schedule": "0 15 * * *" },
  { "path": "/api/cron/daily-scan", "schedule": "0 16 * * *" }
]
```
