# Dynamic Survey Builder

My submission for the AiGeeks Full-Stack Intern task. An admin builds surveys with conditional logic, anyone can answer them through a public link without logging in, and the admin sees the results as charts.

Stack: Next.js 15 (TypeScript, Tailwind) for the frontend, Go for the API, PostgreSQL for storage.

## Live demo

| What | Link |
|---|---|
| Homepage (open surveys) | https://dynamic-survey-builder-nu.vercel.app |
| Demo survey (no login needed) | https://dynamic-survey-builder-nu.vercel.app/s/customer-satisfaction-demo |
| Admin sign-in | https://dynamic-survey-builder-nu.vercel.app/admin |
| API health check | https://survey-builder-api.onrender.com/healthz |
| Demo video | https://www.loom.com/share/03ee1bb67db340c78bc6f9115fdadf4b |

### Admin login

| | |
|---|---|
| Email | `demo@example.com` |
| Password | `demo-pass-123` |

This account already has a seeded "Customer Satisfaction" survey with 8 questions, conditional logic, 2 published versions and about 68 responses spread over 4 weeks, so the Results page has something to show straight away.

**Note:** the API is on Render's free plan and goes to sleep after 15 minutes of no traffic. The first request after that takes around 50 seconds. Opening the health check link first wakes it up.

### Quick tour

1. Open the homepage and answer the demo survey. Give a low satisfaction score and you'll see a follow-up question appear.
2. Sign in at `/admin`.
3. Open the survey's **Results** to see the charts and the version filter.
4. Create a new survey, add questions, set a condition, publish it, and switch on **Show on homepage** if you want it listed.

## Features

### Required

- [x] Create a survey with a title and description
- [x] Four question types: text, single choice, multiple choice, rating 1–5
- [x] Add, remove, duplicate and reorder questions (drag and drop, or the ↑/↓ buttons with the keyboard)
- [x] Mark questions as required
- [x] Conditional logic: "show this question only if question X is / includes / is at least / is at most …"
- [x] Public form with no login, rendered from the saved schema (nothing is hardcoded)
- [x] Validation of required fields and answer types, on the client and again on the server
- [x] Survey schemas stored as JSON (Postgres `JSONB`)
- [x] Responses stored in their own table, separate from the schemas
- [x] REST API
- [x] Analytics: total responses, count per option, average and distribution for ratings, list of text answers

### Bonus

- [x] JWT authentication for the admin
- [x] Rate limiting and spam protection on submissions
- [x] Survey versioning
- [ ] Saving partial responses (the server-side validator already has a `partial` mode, but I didn't get to the endpoint and UI)

### Extras I added

- A homepage that lists open surveys. Each survey has a **Show on homepage** switch, so a survey can also be shared by link only.
- One admin account created from environment variables at deploy time. Public sign-up is turned off.
- A responses-per-day chart for the last 30 days, a version filter on the Results page, and a table view under every chart.
- Seeded demo data, a responsive layout, and keyboard-accessible forms.

## Tech stack

| Part | What I used | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4 | Fast to build with, and easy to deploy on Vercel |
| Drag and drop | dnd-kit | Works with the keyboard and on touch screens |
| API | Go, chi router, pgx | Small, fast, and a single binary to deploy |
| Database | PostgreSQL 16 | JSONB for the schemas, with real SQL for the analytics |
| Migrations | goose (embedded in the binary) | Migrations run automatically on startup |
| Auth | JWT (HS256) + bcrypt | Simple and stateless |
| Tests | `go test`, Vitest | |
| Hosting | Vercel (web), Render (API + Postgres, Singapore) | Both have free plans |

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        A["Admin<br/>builder, results"]
        R["Respondent<br/>/s/:slug"]
    end
    subgraph Vercel
        W["Next.js app"]
    end
    subgraph Render
        API["Go API<br/>JWT, rate limits, validation"]
        DB[("PostgreSQL")]
    end
    A --> W
    R --> W
    A -- "JSON + JWT" --> API
    R -- "JSON, no auth" --> API
    API --> DB
```

- Next.js only serves the UI. The browser calls the Go API directly, so there's a single backend.
- The API doesn't trust the frontend. Everything the UI checks is checked again on the server, so sending requests with curl doesn't get around any rule.
- Inside the API I split the code into three layers:
  - `handlers` deals with HTTP.
  - `survey` holds the rules: schema validation, which questions are visible, and answer validation. It has no database code, which makes it easy to unit test.
  - `store` holds all the SQL.

## Data model

```mermaid
erDiagram
    admins ||--o{ surveys : owns
    surveys ||--o{ survey_versions : publishes
    surveys ||--o{ responses : receives
    survey_versions ||--o{ responses : "answered against"
    surveys {
        uuid id
        text slug
        text status
        bool listed
        jsonb draft_schema
    }
    survey_versions {
        uuid id
        int version
        jsonb schema
    }
    responses {
        uuid id
        jsonb answers
        text ip_hash
    }
```

Here's what a schema looks like:

```json
{ "questions": [
  { "id": "q_sat", "type": "rating", "title": "Overall, how satisfied are you?", "required": true, "min": 1, "max": 5 },
  { "id": "q_low", "type": "text", "title": "What went wrong?", "required": true,
    "showIf": { "questionId": "q_sat", "operator": "lte", "value": 2 } }
] }
```

And an answer: `{"q_sat": 2, "q_low": "Too slow"}`.

### Why JSONB and not a questions table

A survey gets read and saved as a whole, the fields differ by question type, and versioning means copying the whole thing. A JSON document fits that better than spreading it over several tables. Postgres can still look inside JSONB, so the analytics are plain SQL. The downside is that the database can't enforce the structure, so I validate it in Go and test that validation.

### Why versions

The builder always edits a draft (`draft_schema`). When I publish, the API saves an immutable copy as a new row in `survey_versions`, and each response stores the version it answered. This means:

- Editing a live survey never breaks old responses.
- Someone who opened the form before I re-published can still submit against the version they saw.
- Publishing runs in one transaction that locks the survey row, so two publishes at the same time can't create the same version number.

## Conditional logic and validation

- A condition can only point to a question **above** it. That rules out loops, so I can work out which questions are visible in one pass from top to bottom.
- If the question a condition depends on is hidden, the dependent question is hidden too. That's how chained conditions work.
- Each question type has its own operators: single choice uses `is`, multiple choice uses `includes`, and rating uses `is`, `is at least` or `is at most`.
- Questions and options get random IDs, not array positions. Reordering or renaming them never disconnects existing answers.
- The same rules exist in TypeScript, for instant feedback in the form, and in Go, as the real check. On submit, the server:
  1. Works out which questions are visible for this set of answers.
  2. Drops any answers to hidden questions.
  3. Checks that every visible required question is answered.
  4. Checks each answer's type (a valid option ID, a whole number in the rating range, text within the length limit).

## Analytics

All the analytics are computed in SQL rather than by loading responses into Go:

- `jsonb_each` and `jsonb_array_elements_text` turn the answers into rows to count.
- `generate_series` fills in days with zero responses for the daily chart.
- The independent queries run at the same time (`errgroup`).
- Text answers use cursor-based pagination ("Load more") instead of `OFFSET`.

I didn't use a chart library. The bars are plain HTML/CSS, each chart has a table view, and that was enough for what the task needs.

## Run it locally

You need Docker, Go 1.26+ and Node 20+.

```bash
# 1. Postgres + API. Migrations run and the demo data is loaded on startup.
docker compose up --build

# 2. Frontend, in a second terminal
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:8080/healthz
- Postgres: `localhost:5433` (user, password and database are all `survey`)
- Admin login: `demo@example.com` / `demo-pass-123`

### Environment variables (API)

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | At least 32 characters, used to sign tokens |
| `ALLOWED_ORIGINS` | Frontend URLs allowed by CORS, comma-separated |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The admin account, created on startup if it doesn't exist yet |
| `ALLOW_REGISTRATION` | `true` turns public sign-up back on (off by default) |
| `SEED_DEMO` | `true` loads the demo survey and responses on startup |
| `PORT` | Defaults to `8080` |

The frontend needs only `NEXT_PUBLIC_API_URL`, which points to the API.

### Reset the demo data

```bash
cd apps/api
DATABASE_URL="postgres://survey:survey@localhost:5433/survey?sslmode=disable" go run ./cmd/seed -reset
```

### Tests

```bash
cd apps/api && go test ./...
cd apps/web && npm test
```

The Go tests cover auth, schema and answer validation, visibility, the handlers, the rate limiter and the analytics. The web tests cover the TypeScript copy of the validation rules and the builder helpers.

## API reference

Every endpoint takes and returns JSON. Errors look like `{"error": "...", "fields": {"questions.0.title": "..."}}`.

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/auth/login` | | Returns a JWT. Rate limited to 10 per minute |
| `POST /api/auth/register` | | `403` unless `ALLOW_REGISTRATION=true` |
| `GET /api/auth/me` | JWT | The signed-in admin |
| `GET /api/surveys` | JWT | List my surveys |
| `POST /api/surveys` | JWT | Create a draft |
| `GET /api/surveys/:id` | JWT | Get a survey |
| `PUT /api/surveys/:id` | JWT | Save the draft. `422` with field paths if it's invalid |
| `DELETE /api/surveys/:id` | JWT | Delete a survey |
| `POST /api/surveys/:id/publish` | JWT | `201` new version, `200` if nothing changed. Also reopens a closed survey |
| `POST /api/surveys/:id/close` | JWT | Stop accepting responses |
| `GET /api/surveys/:id/versions` | JWT | Published versions |
| `GET /api/surveys/:id/analytics?version=N` | JWT | Totals, daily counts and per-question stats |
| `GET /api/surveys/:id/analytics/questions/:qid/answers` | JWT | Text answers, paginated with a cursor |
| `GET /api/public/surveys` | | Surveys listed on the homepage |
| `GET /api/public/surveys/:slug` | | The published form. `404` for a draft, `410` once closed |
| `POST /api/public/surveys/:slug/responses` | | Submit. `422` per question, `429` when rate limited |

## Security

- Passwords are hashed with bcrypt. Login returns the same error for a wrong email and a wrong password.
- JWTs only accept HS256, so a token with `alg: none` is rejected. They expire after 24 hours.
- Every survey query is filtered by the admin's ID. Asking for another admin's survey returns `404`.
- Request bodies are limited to 1 MB and unknown JSON fields are rejected.
- Rate limits per IP: login 10/min, public reads 120/min, submissions 10/min.
- The form has a hidden honeypot field. Bots that fill it in are ignored.
- Only a hash of the respondent's IP is stored, never the IP itself.
- CORS only allows the deployed frontend.
- No secrets are in the repo. On Render the database URL comes from the managed database, and `JWT_SECRET` is generated by Render.

## Assumptions

- There's one admin, created from environment variables, and nobody else can sign up. Surveys are still scoped per admin in the database, so turning registration on would work.
- Respondents are anonymous. The same person can answer more than once, so the rate limits are the only guard against abuse.
- "Required" means required when the question is shown. A hidden question is never required.
- Each question has at most one condition (no AND/OR groups), and a condition can only depend on a choice or rating question.
- New surveys are not listed on the homepage until the admin turns that on. The direct link always works once published.
- With "All versions" selected, the Results page uses the questions from the live version. Answers for options that were later removed are grouped as "Options removed in a later version", so the totals still add up.

## Trade-offs

| What I did | Why | What I'd change for production |
|---|---|---|
| JWT stored in `localStorage` | The web app and the API are on different domains, where cross-site cookies are unreliable | An `httpOnly` cookie on a shared domain |
| In-memory rate limiter | No extra infrastructure | Redis, so the limits hold across several instances |
| Analytics calculated on every request | Always up to date, and fast enough for thousands of responses | Pre-computed counters or materialised views for much larger surveys |
| Daily chart buckets in UTC | Simple | Use the admin's timezone |
| Deleting a survey deletes its responses | Simple | Soft delete so it can be undone |
| The last save wins if the same draft is open in two tabs | Simple | Reject a save from an outdated copy (optimistic locking) |
| Free hosting | No cost | The API has a cold start, and the free database expires on 2026-12-18 |

## Deployment

- **API and database:** Render, from [`render.yaml`](render.yaml). It creates a free Postgres database and runs the API's Dockerfile in Singapore.
- **Frontend:** Vercel, with the root directory set to `apps/web` and `NEXT_PUBLIC_API_URL` set to the Render URL. Every push to `main` redeploys it.

## Project structure

```
apps/
  api/
    cmd/server/        starts the API: run migrations, create the admin, serve
    cmd/seed/          loads or resets the demo data
    internal/
      auth/            bcrypt, JWT, auth middleware
      config/          reads environment variables
      handlers/        HTTP handlers
      ratelimit/       per-IP rate limiter
      seed/            demo survey and responses
      store/           database queries
      survey/          schema, visibility and answer validation rules
    migrations/        SQL migrations
  web/
    src/app/           pages: /, /admin, /surveys, builder, results, /s/[slug]
    src/components/    builder, form and analytics components
    src/lib/           API client, types, validation rules
docker-compose.yml     local Postgres + API
render.yaml            Render setup
```

## What I'd do with more time

- Save partial responses, so a respondent can come back and finish later.
- CSV export of responses.
- AND/OR condition groups, and more question types (date, number, matrix).
- Optimistic locking in the builder, and soft delete.
- Summarise text answers with an LLM, run in the background, cached, and treating respondent text as untrusted.
