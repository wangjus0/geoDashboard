# Tech Documentation

Last updated: May 2026

This is the technical source of truth for future maintainers. Keep it focused and
update it in the same change as code that alters setup, auth, storage, model
scanning, scheduled tracking, deployment, or user-visible behavior.

## Summary

Ark Dashboard is an internal Vite + React app with an Express API. It tracks
Ark Marketing's AI visibility across ChatGPT, Claude, and Gemini for ad hoc
prompts and a daily San Diego media-buying prompt pool.

At a high level:

1. The dashboard loads auth configuration and establishes a signed HTTP-only
   dashboard session cookie.
2. Users run ad hoc prompt scans, or Vercel Cron triggers the daily scan.
3. The backend queries ChatGPT, Claude, and Gemini, or returns deterministic
   mock answers when `MODEL_SCAN_MODE=mock` or a provider key is missing.
4. Scan responses are normalized into mention status, rank, snippet, and raw
   response text.
5. Results are stored in Supabase/Postgres or local JSON depending on
   `QUERY_STORE_DRIVER` and `DATABASE_URL`.
6. The UI renders recent query history, aggregate model visibility metrics, and
   admin access controls.

## Current Status

- Production app: `https://geo-dashboard-black.vercel.app`
- Vercel project: `geo-dashboard`
- Supabase project ref: `usgsllxucjzmksnsdnfy`
- Production auth method: `AUTH_METHOD=azure_oauth`
- Active prompt pool: 10 San Diego media-buying prompts

## Main Files

| Path                                            | Purpose                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `src/App.jsx`                                   | Main React dashboard, auth flow, scans, charts, and access UI.     |
| `src/App.css`                                   | Dashboard visual system and responsive layout styles.              |
| `src/index.css`                                 | Global frontend styles.                                            |
| `backend/src/app.ts`                            | Express app, CORS, JSON parsing, health check, and route mounting. |
| `backend/src/index.ts`                          | Local server listener and Vercel-compatible app export.            |
| `backend/src/config/env.ts`                     | Environment loading, defaults, and parsed runtime settings.        |
| `backend/src/routes/auth.routes.ts`             | Auth config, Azure OAuth, email login, session, and access routes. |
| `backend/src/routes/model.routes.ts`            | Authenticated model scan, recent query, and summary routes.        |
| `backend/src/routes/cron.routes.ts`             | Daily tracking cron route.                                         |
| `backend/src/controllers/model.controller.ts`   | Request validation and scan response handlers.                     |
| `backend/src/controllers/cron.controller.ts`    | Cron auth, Pacific 8 AM guard, and daily tracking handler.         |
| `backend/src/services/aiProviders.service.ts`   | OpenAI, Anthropic, Gemini, and mock provider calls.                |
| `backend/src/services/scan.service.ts`          | Multi-model scan orchestration and rank/mention extraction.        |
| `backend/src/services/queryStore.service.ts`    | Local JSON or Postgres query storage and aggregate metrics.        |
| `backend/src/services/dailyTracking.service.ts` | Active prompt loading, run status, and daily tracking persistence. |
| `backend/src/services/accessControl.service.ts` | Email-domain allowlisting and dashboard access user management.    |
| `backend/src/services/supabaseAuth.service.ts`  | Supabase Auth Azure OAuth, magic link, and token verification.     |
| `api/[...route].ts`                             | Vercel serverless entrypoint.                                      |
| `supabase/migrations/`                          | Versioned schema, RLS, role, access, and prompt-pool migrations.   |
| `vercel.json`                                   | Vercel function duration, rewrites, and cron schedules.            |
| `backend/.env.example`                          | Local environment variable template.                               |

## Local Setup

Requirements:

- Node.js and npm. The project currently uses TypeScript 5, Vite 7, React 19,
  and Node 22 type definitions.
- Supabase access when testing Postgres-backed storage or auth flows.
- OpenAI, Anthropic, and Gemini keys when testing live provider scans.

```bash
npm install
cp backend/.env.example .env
npm run dev
```

Open `http://localhost:5173`. The local backend listens on
`http://localhost:3000`.

For local scan development without model-provider calls, set:

```bash
MODEL_SCAN_MODE=mock
```

For local query storage without Postgres, set:

```bash
QUERY_STORE_DRIVER=local
```

The backend loads environment variables from `.env` and then `backend/.env`.
Auth and access-management routes still require the configured auth/storage
dependencies for the selected `AUTH_METHOD`.

## Environment Variables

The backend reads `.env` in local development through `dotenv`. In Vercel, set
the same names as encrypted project environment variables. Vite only exposes
frontend variables prefixed with `VITE_`.

Use this as the checklist for filling local `.env` and Vercel environment
variables.

| Variable                      | How to get it                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `PORT`                        | Use `3000` locally unless another service already uses that port.                                        |
| `COMPANY_NAME`                | Use the tracked brand name, currently `Ark Marketing`.                                                   |
| `VITE_API_BASE_URL`           | Use `http://localhost:3000` locally, or leave blank in production so the app calls same-origin `/api/*`. |
| `DATABASE_URL`                | In Supabase, open Project Settings > Database > Connection string > Transaction pooler. Use port `6543`. |
| `SUPABASE_URL`                | In Supabase, open Project Settings > API and copy the Project URL.                                       |
| `SUPABASE_PUBLISHABLE_KEY`    | In Supabase, open Project Settings > API and copy an enabled publishable key or legacy anon key.         |
| `SESSION_SECRET`              | Generate with `openssl rand -base64 32`; keep the same production value across deployments.              |
| `CORS_ORIGINS`                | Use the browser origin that loads the frontend, for example `http://localhost:5173` or production URL.   |
| `AUTH_METHOD`                 | Choose `azure_oauth` for production, or a rollback mode listed in [Auth And Access](#auth-and-access).   |
| `ALLOWED_EMAIL_DOMAINS`       | List approved company email domains without `@`, comma-separated.                                        |
| `DASHBOARD_ADMIN_EMAILS`      | List exact admin email addresses, comma-separated.                                                       |
| `PUBLIC_APP_URL`              | Use the frontend base URL that auth should redirect back to.                                             |
| `OPENAI_API_KEY`              | In the OpenAI platform, select the billing project and create a secret key with `gpt-4o-mini` access.    |
| `ANTHROPIC_API_KEY`           | In the Anthropic Console, create an API key with access to `claude-3-5-haiku-latest`.                    |
| `GEMINI_API_KEY`              | In Google AI Studio, create an API key with access to `gemini-2.5-flash`.                                |
| `QUERY_STORE_DRIVER`          | Use `local` for file-backed local development or `postgres` for Supabase-backed storage.                 |
| `MODEL_SCAN_MODE`             | Use `mock` for local development without provider calls or `live` for real provider scans.               |
| `CRON_SECRET`                 | Generate a long random value with `openssl rand -base64 32` and use it as the cron bearer token.         |
| `DAILY_TRACKING_PROMPT_LIMIT` | Use `25` unless intentionally limiting daily scan volume.                                                |
| `RESEND_API_KEY`              | In Resend, create an API key for the account/domain that sends dashboard access codes.                   |
| `ACCESS_EMAIL_FROM`           | In Resend, use a verified sender identity, for example `Geo Dashboard <access@example.com>`.             |
| `LOGIN_CODE_TTL_MINUTES`      | Use `10` unless changing email-code expiry; the backend caps this at 60.                                 |

### Local

| Variable                      | What to set                                           | Notes                                                                 |
| ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `PORT`                        | `3000`                                                | Local Express API port.                                               |
| `COMPANY_NAME`                | `Ark Marketing`                                       | Company name used for mention and rank detection.                     |
| `VITE_API_BASE_URL`           | `http://localhost:3000` or blank                      | The frontend defaults to `http://localhost:3000` in Vite dev mode.    |
| `QUERY_STORE_DRIVER`          | `local` or `postgres`                                 | `local` stores scans in `backend/data/query-store.json`.              |
| `MODEL_SCAN_MODE`             | `mock` or `live`                                      | `mock` avoids provider API calls.                                     |
| `DATABASE_URL`                | Postgres connection string                            | Required for Postgres storage, daily tracking, and access management. |
| `SUPABASE_URL`                | Supabase project URL                                  | Current project URL is `https://usgsllxucjzmksnsdnfy.supabase.co`.    |
| `SUPABASE_PUBLISHABLE_KEY`    | Supabase publishable key                              | Used for Supabase Auth flows.                                         |
| `SESSION_SECRET`              | Long random string                                    | Signs the `ark_dashboard_session` cookie.                             |
| `CORS_ORIGINS`                | `http://localhost:5173`                               | Comma-separated browser origins allowed by the backend.               |
| `AUTH_METHOD`                 | `azure_oauth`, `email_code`, or `supabase_magic_link` | Selects the login flow exposed by the UI.                             |
| `ALLOWED_EMAIL_DOMAINS`       | `arkmarketing.com,arcmarketing.com`                   | Allowed domains for dashboard access.                                 |
| `DASHBOARD_ADMIN_EMAILS`      | Admin email list                                      | Comma-separated exact emails with admin access.                       |
| `PUBLIC_APP_URL`              | `http://localhost:5173`                               | Redirect base URL for auth callbacks and magic links.                 |
| `OPENAI_API_KEY`              | OpenAI secret key                                     | Required for live ChatGPT scans.                                      |
| `ANTHROPIC_API_KEY`           | Anthropic secret key                                  | Required for live Claude scans.                                       |
| `GEMINI_API_KEY`              | Google AI Studio key                                  | Required for live Gemini scans.                                       |
| `CRON_SECRET`                 | Bearer token                                          | Required to call `/api/cron/daily-scan`.                              |
| `DAILY_TRACKING_PROMPT_LIMIT` | `25`                                                  | Max active prompts read per daily run, capped at 100 in code.         |
| `RESEND_API_KEY`              | Resend API key                                        | Required only for production email-code delivery.                     |
| `ACCESS_EMAIL_FROM`           | Sender identity                                       | Required with `RESEND_API_KEY` for email-code delivery.               |
| `LOGIN_CODE_TTL_MINUTES`      | `10`                                                  | Email-code TTL, capped at 60 in code.                                 |

### Production

| Variable                      | What to set                                | Notes                                                    |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| `VITE_API_BASE_URL`           | Blank                                      | Lets the browser use same-origin `/api/*` on Vercel.     |
| `DATABASE_URL`                | Supabase pooler URL                        | Use the `geo_dashboard_app` role and port `6543`.        |
| `QUERY_STORE_DRIVER`          | `postgres`                                 | Production stores scans in Supabase/Postgres.            |
| `MODEL_SCAN_MODE`             | `live`                                     | Production should call real providers.                   |
| `CRON_SECRET`                 | Long random bearer token                   | Required by the daily cron endpoint.                     |
| `DAILY_TRACKING_PROMPT_LIMIT` | `25`                                       | Production can track the full active prompt pool.        |
| `SESSION_SECRET`              | Long random string                         | Generate with `openssl rand -base64 32`.                 |
| `AUTH_METHOD`                 | `azure_oauth`                              | Current production auth mode.                            |
| `ALLOWED_EMAIL_DOMAINS`       | `arkmarketing.com,arcmarketing.com`        | Keep narrow for production access.                       |
| `DASHBOARD_ADMIN_EMAILS`      | `audrey@arkmarketing.com`                  | Exact admin emails.                                      |
| `SUPABASE_URL`                | `https://usgsllxucjzmksnsdnfy.supabase.co` | Current Supabase project URL.                            |
| `SUPABASE_PUBLISHABLE_KEY`    | Supabase publishable key                   | Use an enabled publishable or legacy anon key.           |
| `PUBLIC_APP_URL`              | `https://geo-dashboard-black.vercel.app`   | Production auth redirect base URL.                       |
| `OPENAI_API_KEY`              | OpenAI secret key                          | Required for live ChatGPT scans.                         |
| `ANTHROPIC_API_KEY`           | Anthropic secret key                       | Required for live Claude scans.                          |
| `GEMINI_API_KEY`              | Google AI Studio key                       | Required for live Gemini scans.                          |
| `CORS_ORIGINS`                | `https://geo-dashboard-black.vercel.app`   | Production browser origin.                               |
| `COMPANY_NAME`                | `Ark Marketing`                            | Optional override; defaults to `Ark Marketing`.          |
| `RESEND_API_KEY`              | Resend API key                             | Needed only if production uses `AUTH_METHOD=email_code`. |
| `ACCESS_EMAIL_FROM`           | Verified sender                            | Needed only if production uses `AUTH_METHOD=email_code`. |

### Getting Integration Values

Supabase and Postgres:

1. Open the Supabase project named `geo-dashboard`.
2. Confirm the project ref is `usgsllxucjzmksnsdnfy`.
3. Copy the API URL: `https://usgsllxucjzmksnsdnfy.supabase.co`.
4. Copy an enabled publishable key for `SUPABASE_PUBLISHABLE_KEY`.
5. Apply all migrations in `supabase/migrations/` before production deploys.
6. Use the Supabase transaction pooler for `DATABASE_URL`:

```bash
DATABASE_URL=postgresql://geo_dashboard_app.usgsllxucjzmksnsdnfy:<password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

Microsoft Azure provider in Supabase Auth:

1. In Supabase Auth, enable the Azure provider.
2. Set the tenant URL to `https://login.microsoftonline.com/862026b2-1235-46fa-8934-00c08b207aff`.
3. In the Microsoft app registration, add the callback URL:

```text
https://usgsllxucjzmksnsdnfy.supabase.co/auth/v1/callback
```

4. In Supabase URL configuration, set the production and local redirect URLs:

```text
Site URL:
https://geo-dashboard-black.vercel.app

Redirect URLs:
https://geo-dashboard-black.vercel.app/
https://geo-dashboard-black.vercel.app/**
http://localhost:5173/
http://localhost:5173/**
```

Model providers:

1. Create an OpenAI API key with access to `gpt-4o-mini`.
2. Create an Anthropic API key with access to `claude-3-5-haiku-latest`.
3. Create a Google AI Studio or Gemini API key with access to
   `gemini-2.5-flash`.
4. Set the corresponding Vercel environment variables.

Vercel:

1. Use repository root as the project root.
2. Set build command to `npm run build`.
3. Set output directory to `dist`.
4. Add production environment variables in Project Settings > Environment
   Variables.
5. Keep cron and rewrite behavior in `vercel.json` under version control.

## Auth And Access

Auth modes:

- `azure_oauth`: Supabase Auth with the Azure provider. This is production.
- `supabase_magic_link`: Supabase Auth email magic-link rollback mode.
- `email_code`: Dashboard-generated six-digit code stored in Postgres and sent
  through Resend when email delivery is configured.

The production flow uses Supabase Auth to verify the Azure user, then the
backend creates its own signed HTTP-only `ark_dashboard_session` cookie. Session
duration is 12 hours. Access is still limited by `ALLOWED_EMAIL_DOMAINS` and
admin status is controlled by `DASHBOARD_ADMIN_EMAILS` or
`public.dashboard_access_users`.

Public paths:

- `/health`
- `/api/auth/config`
- `/api/auth/azure/start`
- `/api/auth/supabase/request-link`
- `/api/auth/supabase/session`
- `/api/auth/email/request-code`
- `/api/auth/email/verify-code`
- `/api/auth/logout`

Authenticated routes:

- `POST /api/models/scan`
- `GET /api/models/recent-queries`
- `GET /api/models/overall-summary`

Admin-only routes:

- `GET /api/auth/access-users`
- `POST /api/auth/access-users`
- `DELETE /api/auth/access-users/:id`

Legacy rollback modes remain available with:

```bash
AUTH_METHOD=supabase_magic_link
AUTH_METHOD=email_code
```

## Database

All database changes must be expressed as versioned SQL migrations in
`supabase/migrations/`. Do not edit production schema or prompt rows directly.

Current Supabase project:

- Project name: `geo-dashboard`
- Project ref: `usgsllxucjzmksnsdnfy`
- API URL: `https://usgsllxucjzmksnsdnfy.supabase.co`

Core tables:

- `public.prompt_queries`: stored scan history.
- `public.tracked_prompts`: active prompt pool for daily tracking.
- `public.daily_tracking_runs`: per-prompt daily run status.
- `public.dashboard_access_users`: allowlisted dashboard users and admins.
- `public.dashboard_login_codes`: hashed email-code login records.

RLS is enabled on user-facing tables. Direct client access is denied for `anon`
and `authenticated`, and the backend writes through the dedicated
`geo_dashboard_app` Postgres role.

## Scan And Tracking

Supported models:

- `chatgpt` through OpenAI `gpt-4o-mini`.
- `claude` through Anthropic `claude-3-5-haiku-latest`.
- `gemini` through Google `gemini-2.5-flash`.

Prompt sent to each provider:

```text
Answer the search intent: "<query>". Keep response to about 80 words and include notable companies if relevant.
```

Scan normalization:

- `mentioned` is true when the raw model response includes `COMPANY_NAME`.
- `rank` is extracted from `#1`, ordered-list patterns like `1.`, or defaults
  to `1` when the company is mentioned without a visible rank.
- `snippet` is the first 240 characters of the raw response.
- Provider errors are captured per model instead of failing the whole scan.

Daily tracking:

1. Vercel Cron calls `/api/cron/daily-scan` with `Authorization: Bearer ${CRON_SECRET}`.
2. The handler skips unless the current time is inside the 8 AM hour in
   `America/Los_Angeles`.
3. Active prompts are read from `public.tracked_prompts`, ordered by
   `created_at`, and limited by `DAILY_TRACKING_PROMPT_LIMIT`.
4. Each prompt gets one `public.daily_tracking_runs` row per UTC run date.
5. Completed runs are not overwritten by later retries for the same prompt and
   date.
6. Successful scans are stored in `public.prompt_queries` and linked back to the
   daily run.

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

To change the pool, add a new migration that deactivates old prompts and upserts
the new active set.

## Query Storage

Local development options:

- `QUERY_STORE_DRIVER=local` stores scan history in
  `backend/data/query-store.json`.
- If `DATABASE_URL` is missing, query storage also falls back to local JSON.

Production default:

- `QUERY_STORE_DRIVER=postgres`
- `DATABASE_URL` points to the Supabase transaction pooler.
- Scan history is stored in `public.prompt_queries`.
- Daily tracking metadata is stored in `public.daily_tracking_runs`.

## Key Endpoints

| Endpoint                          | Method   | Purpose                                            |
| --------------------------------- | -------- | -------------------------------------------------- |
| `/health`                         | GET      | Public API health check.                           |
| `/api/auth/config`                | GET      | Auth method and provider readiness for the UI.     |
| `/api/auth/session`               | GET      | Current dashboard session.                         |
| `/api/auth/azure/start`           | GET      | Start Supabase Azure OAuth.                        |
| `/api/auth/supabase/request-link` | POST     | Request Supabase magic-link login.                 |
| `/api/auth/supabase/session`      | POST     | Exchange Supabase access token for app session.    |
| `/api/auth/email/request-code`    | POST     | Create and send a dashboard email login code.      |
| `/api/auth/email/verify-code`     | POST     | Verify an email login code and set session cookie. |
| `/api/auth/access-users`          | GET/POST | Admin list or upsert dashboard access users.       |
| `/api/auth/access-users/:id`      | DELETE   | Admin deactivate a dashboard access user.          |
| `/api/auth/logout`                | POST     | Clear the dashboard session cookie.                |
| `/api/models/scan`                | POST     | Authenticated ad hoc model scan.                   |
| `/api/models/recent-queries`      | GET      | Authenticated paginated scan history.              |
| `/api/models/overall-summary`     | GET      | Authenticated aggregate visibility summary.        |
| `/api/cron/daily-scan`            | GET      | Bearer-protected daily prompt tracking.            |

## Deployment

Vercel uses:

- `api/[...route].ts` as the serverless entrypoint.
- `vercel.json` rewrites for `/api/:path*` and `/health`.
- `vercel.json` cron schedules for daily tracking.
- `npm run build` for frontend production assets.
- `npm run build:api` for backend TypeScript verification.

Vercel project settings:

- Project root: repository root.
- Build command: `npm run build`.
- Output directory: `dist`.

Vercel Cron schedules are UTC-only, so production invokes the endpoint at both
UTC hours that can map to 8 AM Pacific. The handler runs only when the current
time is inside the `America/Los_Angeles` 8 AM hour.

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

Manual cron validation:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://geo-dashboard-black.vercel.app/api/cron/daily-scan
```

Outside the 8 AM Pacific window, the expected response is a skip with
`outside_pacific_8am_window`.

Deploy to production:

```bash
vercel deploy --prod --yes
```

## Validation

Run before handoff:

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
npx tsc -p backend/tsconfig.json --noEmit
npm run build
npm run build:api
```

With the backend running locally:

```bash
curl -sS http://localhost:3000/health
curl -sS http://localhost:3000/api/auth/config
```

Production smoke checks:

```bash
curl -i https://geo-dashboard-black.vercel.app/health
curl https://geo-dashboard-black.vercel.app/api/auth/config
```

For behavior changes, also test the relevant user flow in the browser:

- Azure login and logout.
- Ad hoc prompt scan.
- Recent query pagination.
- Overall visibility summary.
- Admin access-user list, add, and deactivate.
- Mobile dashboard layout.
- Daily cron manual validation when cron behavior changes.

## Troubleshooting

| Symptom                                 | Check                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/health` fails                         | Confirm Vercel rewrite to `/api/[...route]` and backend startup.                           |
| `/api/auth/config` reports unconfigured | Check `AUTH_METHOD`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and allowed domains.      |
| Azure login fails                       | Check Supabase Azure provider settings, callback URL, redirect URLs, and publishable key.  |
| Auth succeeds but API returns 401       | Check `SESSION_SECRET`, cookie settings, same-origin API URL, and browser cookie state.    |
| Admin access routes return 403          | Confirm the signed-in email is in `DASHBOARD_ADMIN_EMAILS` or has `role = 'admin'`.        |
| Scan returns provider errors            | Verify `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and provider model access. |
| Scans use mock answers                  | Check `MODEL_SCAN_MODE` and whether provider API keys are missing.                         |
| Scan history saves locally              | Check `QUERY_STORE_DRIVER` and `DATABASE_URL`.                                             |
| Postgres writes fail                    | Confirm migrations, `geo_dashboard_app` grants, RLS policies, and pooler credentials.      |
| Daily cron returns 401                  | Confirm `Authorization: Bearer ${CRON_SECRET}` exactly matches production env.             |
| Daily cron returns skipped              | Expected outside the Pacific 8 AM hour.                                                    |
| Prompt pool is stale                    | Apply the latest `supabase/migrations/` prompt-pool migration.                             |
| Browser CORS error                      | Add the frontend origin to `CORS_ORIGINS` with scheme and no trailing path.                |
