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

## Vercel Deployment

Create one Vercel project with this repository root as the project root.

- Build command: `npm run build`
- Output directory: `dist`

Set this environment variable in Vercel:

```bash
VITE_API_BASE_URL=
```

Leave `VITE_API_BASE_URL` empty to use same-origin API routes (`/api/*`) in production.
