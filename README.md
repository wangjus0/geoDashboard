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

## Features

- Runs ad hoc prompt scans across ChatGPT, Claude, and Gemini.
- Tracks daily visibility for the active San Diego media-buying prompt pool.
- Stores scan history, prompt pools, tracking runs, and access users in Supabase.
- Supports Supabase Azure OAuth in production with email-code and magic-link rollback modes.
- Provides admin-controlled dashboard access through allowlisted users and domains.

## Stack

- TypeScript
- Vite + React
- Express
- Supabase Auth + Postgres
- OpenAI, Anthropic, and Gemini APIs
- Vercel Serverless Functions + Cron

## Quickstart

Clone the project:

```bash
git clone https://github.com/wangjus0/geoDashboard.git
cd geoDashboard
```

Install dependencies:

```bash
npm install
```

Copy the example environment file:

```bash
cp backend/.env.example .env
```

Reference the maintainer guide to get the environment variables:

[Environment Variables Guide](docs/Documentation.md#deployment)

For local mock mode without Supabase or model-provider calls, set:

```bash
QUERY_STORE_DRIVER=local
MODEL_SCAN_MODE=mock
```

Run the app locally:

```bash
npm run dev
```

## Validation

Run the local checks before handoff:

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
npx tsc -p backend/tsconfig.json --noEmit
npm run build
npm run build:api
```

With the backend running, check readiness:

```bash
curl -sS http://localhost:3000/health
```

## Documentation

- [User Guide](https://docs.google.com/document/d/1J3tnASbRyQmpvElElo42i50nMQnGabt7d9zyQ84_3kc/edit?usp=sharing)
- [Tech Documentation](docs/Documentation.md)
