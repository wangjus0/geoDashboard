<div align="center">
  <br />
  <img src="./public/Ark-Marketing-Logo-Color-Registered-Trademark.webp" alt="Ark Marketing logo" width="220" />
  <h1>Ark Dashboard</h1>
  <h3>Daily AI visibility tracking for Ark Marketing.</h3>
  <p>
    <img src="https://img.shields.io/badge/frontend-React-61dafb" alt="React" />
    <img src="https://img.shields.io/badge/backend-Express-111827" alt="Express" />
    <img src="https://img.shields.io/badge/database-Supabase-3ecf8e" alt="Supabase" />
    <img src="https://img.shields.io/badge/deploy-Vercel-000000" alt="Vercel" />
  </p>
</div>

Ark Dashboard tracks Ark Marketing visibility across ChatGPT, Claude, and Gemini.

For auth, database, prompt pool, cron, deployment, and validation details, read the [operations guide](./docs/operations.md).

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
