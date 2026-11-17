# Dynamic Survey Builder

Admins build surveys with conditional logic, respondents fill them in through a public link, and admins see live analytics.

> Work in progress. Live URL, demo video and the full architecture write-up will be added as features land.

## Tech stack

| Layer    | Choice |
|----------|--------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend  | Go, chi router, pgx |
| Database | PostgreSQL 16 (survey schemas stored as JSONB) |
| Auth     | JWT for admin routes |

## Repository layout

```
apps/
  api/                Go REST API
    cmd/server/       entrypoint
    internal/
      config/         env config
      handlers/       HTTP routes
      survey/         schema types, visibility + validation rules
      store/          Postgres queries + migrations runner
    migrations/       SQL migrations (embedded, applied on startup)
  web/                Next.js frontend
    src/app/          pages (admin builder, analytics, public form /s/[slug])
    src/components/   builder/ and form/ components
    src/lib/          API client, shared schema types
docker-compose.yml    Postgres + API for local development
```

## Data model (summary)

- `surveys`: survey metadata plus the editable **draft** schema (JSONB).
- `survey_versions`: an immutable schema snapshot created each time a survey is published.
- `responses`: answers (JSONB), stored separately and pinned to the `survey_version` the respondent actually saw.

## Local setup

Requirements: Docker, Go 1.26+, Node 20+.

```bash
# 1. Start Postgres + API (migrations run automatically)
docker compose up --build

# 2. Start the frontend
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

- API: http://localhost:8080/healthz
- Web: http://localhost:3000

To run the API without Docker, start only the DB (`docker compose up db`), copy `apps/api/.env.example` to `.env`, export the variables and run `go run ./cmd/server` from `apps/api`.
