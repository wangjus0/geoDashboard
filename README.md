<div align="center">
  <br />
  <img src="./public/Ark-Marketing-Logo-Color-Registered-Trademark.webp" alt="Ark Marketing logo" width="250" />
  <h1>Ark Dashboard</h1>
  <h3>Daily AI visibility tracking for Ark Marketing.</h3>
  <p>
    <img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build" />
    <img src="https://img.shields.io/badge/tests-passing-brightgreen" alt="Tests" />
    <img src="https://img.shields.io/badge/license-private-6B7280" alt="License" />
  </p>
</div>

## Environment Variables

Use `backend/.env.example` as the starting point.

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

For local mock mode without Supabase or model-provider calls:

```bash
QUERY_STORE_DRIVER=local
MODEL_SCAN_MODE=mock
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

For auth, database, prompt pool, cron, deployment, and validation details, read the [operations guide](./docs/operations.md).
