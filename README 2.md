<p align="center">
  <img src="./public/Ark-Marketing-Logo-Color-Registered-Trademark.webp" alt="Ark Marketing logo" width="220" />
  <br />
  <h1 align="center">Ark Dashboard</h1>
  <p align="center"><em>Daily AI visibility tracking for Ark Marketing.</em></p>
  <p align="center">
    <img src="https://img.shields.io/badge/frontend-React-61dafb" alt="React" />
    <img src="https://img.shields.io/badge/backend-Express-111827" alt="Express" />
    <img src="https://img.shields.io/badge/database-Supabase-3ecf8e" alt="Supabase" />
    <img src="https://img.shields.io/badge/deploy-Vercel-000000" alt="Vercel" />
  </p>
</p>

## Features

- Tracks Ark Marketing visibility across ChatGPT, Claude, and Gemini.
- Stores scan history in Supabase Postgres.
- Shows recent prompt performance, rankings, mentions, and provider trends.
- Uses Supabase Azure OAuth with backend domain-based access control.
- Runs daily scheduled tracking through Vercel Cron at 8 AM Pacific.

## Current Status

- Production app: `https://geo-dashboard-black.vercel.app`
- Vercel project: `geo-dashboard`
- Supabase project ref: `usgsllxucjzmksnsdnfy`
- Active prompt pool: 10 San Diego media-buying prompts
- Production auth method: `AUTH_METHOD=azure_oauth`

## Project Layout

```text
src/                 Vite + React dashboard
api/[...route].ts    Vercel serverless entrypoint
backend/src/         Express API, auth, cron, scan services
supabase/migrations/ Versioned schema and data migrations
public/              Ark logo and static assets
```

## Run Locally

Install dependencies:

```bash
npm install
```

Start the frontend and backend in separate terminals:

```bash
npm run dev
npm run dev:api
```

The frontend runs on `http://localhost:5173`.
The backend runs on `http://localhost:3000`.

For a fully local mock mode that does not call Supabase or model providers:

```bash
QUERY_STORE_DRIVER=local
MODEL_SCAN_MODE=mock
```

Local query history is stored in `backend/data/query-store.json` when `QUERY_STORE_DRIVER=local`.

## Environment

Use `backend/.env.example` as the starting point.

Required local backend variables:

```bash
PORT=3000
COMPANY_NAME=Ark Marketing
SESSION_SECRET=
CORS_ORIGINS=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173

AUTH_METHOD=azure_oauth
ALLOWED_EMAIL_DOMAINS=arkmarketing.com,arcmarketing.com
DASHBOARD_ADMIN_EMAILS=audrey@arkmarketing.com

SUPABASE_URL=https://usgsllxucjzmksnsdnfy.supabase.co
SUPABASE_PUBLISHABLE_KEY=
DATABASE_URL=

QUERY_STORE_DRIVER=postgres
MODEL_SCAN_MODE=live
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

CRON_SECRET=
DAILY_TRACKING_PROMPT_LIMIT=25
```

Leave `VITE_API_BASE_URL` empty in production so the frontend uses same-origin API routes under `/api/*`.

## Authentication

Production uses Supabase Auth with the Azure provider.

Supabase provider settings:

- Provider: Azure
- Tenant URL: `https://login.microsoftonline.com/862026b2-1235-46fa-8934-00c08b207aff`
- Callback URL in Microsoft app registration: `https://usgsllxucjzmksnsdnfy.supabase.co/auth/v1/callback`

Supabase URL configuration:

```text
Site URL:
https://geo-dashboard-black.vercel.app

Redirect URLs:
https://geo-dashboard-black.vercel.app/
https://geo-dashboard-black.vercel.app/**
http://localhost:5173/
http://localhost:5173/**
```

The backend verifies the Supabase user session before creating its own HTTP-only dashboard session cookie. Access is still limited by `ALLOWED_EMAIL_DOMAINS`.

Legacy rollback modes remain available with:

```bash
AUTH_METHOD=supabase_magic_link
AUTH_METHOD=email_code
```

## Database

All database changes must be expressed as versioned SQL migrations in `supabase/migrations/`.

Current Supabase project:

- Project name: `geo-dashboard`
- Project ref: `usgsllxucjzmksnsdnfy`
- API URL: `https://usgsllxucjzmksnsdnfy.supabase.co`

Core tables:

- `public.prompt_queries`: stored scan history
- `public.tracked_prompts`: active prompt pool for daily tracking
- `public.daily_tracking_runs`: per-prompt daily run status
- `public.dashboard_access_users`: allowlisted dashboard users/admins

RLS is enabled on user-facing tables. Direct client access is denied, and the backend writes through the dedicated `geo_dashboard_app` Postgres role.

Use the Supabase pooler URL for serverless and local backend connections:

```bash
DATABASE_URL=postgresql://geo_dashboard_app.usgsllxucjzmksnsdnfy:<password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

## Prompt Pool

The cron job reads active prompts from `public.tracked_prompts`.

Current active pool:

```text
best media buying agency in san diego
top media buying agencies in san diego
best media buying company for san diego businesses
san diego media buying agency for local brands
best paid media agency in san diego
top programmatic media buying agency in san diego
best tv and digital media buying agency in san diego
best media planning and buying agency in san diego
san diego agency for media buying and ad placements
best local media buying partner in san diego
```

To change the pool, add a new migration that deactivates old prompts and upserts the new active set. Do not edit production directly.

## Daily Tracking

Vercel Cron is configured in `vercel.json`.

Vercel schedules are UTC-only, so production invokes the endpoint at both UTC hours that can map to 8 AM Pacific. The handler runs only when the current time is inside the `America/Los_Angeles` 8 AM hour.

```json
[
  { "path": "/api/cron/daily-scan", "schedule": "0 15 * * *" },
  { "path": "/api/cron/daily-scan", "schedule": "0 16 * * *" }
]
```

The cron endpoint requires:

```http
Authorization: Bearer ${CRON_SECRET}
```

Manual validation:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://geo-dashboard-black.vercel.app/api/cron/daily-scan
```

Outside the 8 AM Pacific window, the expected response is a skip with `outside_pacific_8am_window`.

## Deployment

Vercel production environment variables:

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

Deploy to production:

```bash
vercel deploy --prod --yes
```

## Validation

Run before finishing changes:

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
npx tsc -p backend/tsconfig.json --noEmit
npm run build
npm run build:api
```

Production smoke checks:

```bash
curl -i https://geo-dashboard-black.vercel.app/health
curl https://geo-dashboard-black.vercel.app/api/auth/config
```
