# Dynamic Survey Builder

Admins build surveys with **conditional logic**, respondents fill them in through a **public link** (no login), and admins see **live analytics**. Built as a full-stack take-home: **Next.js + Go + PostgreSQL**.

## Live demo

| | |
|---|---|
| **App** | https://dynamic-survey-builder-nu.vercel.app |
| **Demo survey (public, no login)** | https://dynamic-survey-builder-nu.vercel.app/s/customer-satisfaction-demo |
| **Admin login** | `demo@example.com` / `demo-pass-123` |
| **API health** | https://survey-builder-api.onrender.com/healthz |
| **Demo video** | _to be added_ |

The demo admin owns a seeded **"Customer Satisfaction"** survey: 8 questions with conditional logic, **2 published versions** and about 68 responses over 4 weeks. Open **Results** to see the analytics, or register your own admin account and build a survey from scratch.

> **First request can take ~50 s.** The API runs on Render's free plan, which sleeps after 15 minutes without traffic. After the first request it's fast.

## Features

**Required**
- [x] **Survey builder:** title and description; **text, single choice, multiple choice and 1–5 rating** questions; add, remove, duplicate and **reorder** (drag and drop, keyboard or ↑/↓); mark required; **conditional logic** ("show Q only if …").
- [x] **Public form:** opened by link with no login; questions **rendered dynamically** from the schema; conditional questions appear and disappear live; validation of required fields and input types on the client **and** the server.
- [x] **Backend:** survey schemas stored as **JSONB**; responses stored **separately** and pinned to the version answered; a clean REST API.
- [x] **Analytics:** total responses; option counts and shares for choice questions; average and distribution for ratings; a paginated list for text answers.

**Bonus**
- [x] **JWT authentication** for admins (bcrypt, HS256, algorithm pinned).
- [x] **Survey versioning:** every publish is an immutable snapshot; responses keep the version they answered.
- [x] **Rate limiting and spam protection:** per-IP token buckets, a honeypot field, and hashed IPs.
- [ ] Saving partial responses: the server validator already supports a `partial` mode; endpoint and UI not built (see *What I'd do next*).

Extras: a 30-day responses chart, a version filter in analytics, a table view for every chart, responsive layouts, accessible forms, and a seeded demo.

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        A["Admin<br/>/surveys, builder, analytics"]
        R["Respondent<br/>/s/:slug"]
    end
    subgraph Vercel
        W["Next.js 15 (App Router)<br/>TypeScript · Tailwind"]
    end
    subgraph Render["Render (Singapore)"]
        API["Go API · chi<br/>JWT · rate limits · validation"]
        DB[("PostgreSQL<br/>JSONB schemas + answers")]
    end
    A -- HTML/JS --> W
    R -- HTML/JS --> W
    A -- "JSON + Bearer JWT (CORS)" --> API
    R -- "JSON, no auth (CORS, rate limited)" --> API
    API -- "pgx pool, SQL aggregation" --> DB
```

- The **browser talks to the Go API directly**. Next.js serves the UI only, so there's one backend and one source of truth.
- The **API is the authority:** it re-validates everything the UI checks, so bypassing the UI with curl gains nothing.
- Code layers: `handlers` (HTTP) → `survey` (pure rules: schema validation, visibility, answer validation) and `store` (all SQL). The rules package has no I/O and is fully unit-tested.

### Data model

```mermaid
erDiagram
    admins ||--o{ surveys : owns
    surveys ||--o{ survey_versions : "publishes"
    surveys ||--o| survey_versions : "current_version_id"
    surveys ||--o{ responses : receives
    survey_versions ||--o{ responses : "answered against"
    surveys {
        uuid id
        text slug
        text status
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
        text status
        text ip_hash
    }
```

Schema JSON (draft and versions):
```json
{ "questions": [
  { "id": "q_sat", "type": "rating", "title": "Overall, how satisfied are you?", "required": true, "min": 1, "max": 5 },
  { "id": "q_low", "type": "text",   "title": "What went wrong?", "required": true,
    "showIf": { "questionId": "q_sat", "operator": "lte", "value": 2 } }
] }
```
Answers JSON: `{"q_role": "developer", "q_sat": 2, "q_low": "Too slow", "q_features": ["builder", "links"]}`.

## Key design decisions

1. **Schemas as JSONB, not a `questions` table.** A survey is a document: it's read and written whole, its shape varies by question type, and versioning means snapshotting it whole. Postgres can still query inside JSONB for analytics. Trade-off: weaker DB-level constraints, so validation lives in Go and is unit-tested.
2. **Draft → immutable versions.**
   - The builder edits `draft_schema`. **Publish** runs one transaction: lock the row (`FOR UPDATE`), validate the draft *inside* the transaction (no time-of-check/time-of-use gap), then insert version `max + 1`.
   - An unchanged draft reuses the current version.
   - Responses reference `survey_version_id`, so editing a live survey never corrupts old answers.
   - Respondents submit against the version they loaded, even if the admin re-publishes mid-fill.
3. **Conditional logic: a condition may only point at an *earlier* question.**
   - This makes cycles impossible and lets visibility be computed in **one top-to-bottom pass**.
   - A question whose target is hidden is hidden too (chained conditions).
   - Operators are typed: single choice uses `equals`, multi choice `includes`, rating `equals`/`gte`/`lte`.
4. **Stable random IDs** for questions and options (never array positions), so reordering and renaming never detach stored answers.
5. **Validation twice, same rules.** TypeScript mirrors of the Go rules give instant feedback; the Go API is the real guard. Both are tested against the same fixtures. The server **drops answers to hidden questions** and enforces "required" only for visible ones.
6. **Analytics in SQL, not in memory.**
   - `jsonb_each` and `jsonb_array_elements_text` turn answers into rows; `row_number()` picks the latest text answers per question; `generate_series` fills days with zero responses.
   - The 7 independent queries run concurrently (`errgroup`).
   - `jsonb_typeof` guards protect against type changes between versions.
   - Text answers page with a keyset cursor, not `OFFSET`.
7. **No chart library.** The charts are HTML/CSS bars (one validated accent colour, ≤ 24px bars, a table view per chart). That's smaller and more accessible for what's needed.

## API

All JSON. Errors look like `{"error": "...", "fields": {"path": "message"}}`.

| Area | Endpoint | Notes |
|---|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` | → `{token, expiresAt, admin}`; rate limited 10/min |
| | `GET /api/auth/me` | current admin |
| Surveys (JWT) | `GET /api/surveys`, `POST /api/surveys` | list / create draft |
| | `GET`, `PUT`, `DELETE /api/surveys/:id` | `PUT` saves `{title, description, draftSchema}` (validated, `422` with field paths) |
| | `POST /api/surveys/:id/publish` | `201` new version, `200` if unchanged (also reopens) |
| | `POST /api/surveys/:id/close` | `409` if not published |
| | `GET /api/surveys/:id/versions` | |
| Analytics (JWT) | `GET /api/surveys/:id/analytics?version=N` | totals, daily counts, per-question stats |
| | `GET /api/surveys/:id/analytics/questions/:qid/answers?cursor=&limit=` | text answers, keyset-paginated |
| Public | `GET /api/public/surveys/:slug` | published version only; draft `404`, closed `410` |
| | `POST /api/public/surveys/:slug/responses` | `{version, answers, website}` → `201`; `422` per question, `409` unknown version, `429` rate limited |

## Security

- **Passwords:** bcrypt (cost 12). Login gives the same error and the same timing for an unknown email and a wrong password.
- **JWT:** HS256 pinned (rejects `alg: none`), issuer and expiry required, 24h lifetime.
- **Ownership:** every survey query filters by `admin_id`; someone else's survey returns **404** (not 403), so IDs can't be probed.
- **Input:** bodies ≤ 1 MiB, unknown JSON fields rejected, strict per-type answer validation.
- **Abuse protection:**
  - Rate limits (token bucket per IP): auth 10/min, public reads 120/min, submissions 10/min (burst 5), with `Retry-After`.
  - A honeypot field silently drops bot submissions.
  - Only an HMAC hash of the IP is stored.
- **CORS:** only the deployed frontend's origin is allowed.
- **Secrets:** the database URL comes from Render's managed database, and `JWT_SECRET` is generated by Render. Neither is in the repo.

## Assumptions

- Admins are independent; there are no teams or shared surveys. Anyone can register an admin account.
- Respondents are anonymous. One person *can* submit more than once; abuse is limited by rate limits, not identity.
- "Required" means "required **when shown**". A hidden question is never required.
- Conditions use a single rule per question (no AND/OR groups), referencing choice or rating questions.
- Analytics "All versions" describes questions using the **live** version. Votes for options removed in a later version are grouped as *"Options removed in a later version"*, so totals still add up.

## Trade-offs and known limitations

| Decision | Why | Cost / how I'd change it |
|---|---|---|
| JWT in `localStorage` (Bearer header) | The frontend (Vercel) and API (Render) are on different domains, where cross-site cookies are unreliable | Readable by an XSS bug; mitigated by a 24h expiry. With a shared domain: an httpOnly `SameSite` cookie |
| In-memory rate limiter | Simple, no extra infrastructure | Per instance and reset on restart → Redis for multiple instances |
| Client IP from `X-Forwarded-For` | Correct behind Render's proxy | Spoofable if the API were exposed directly → trust only known proxy IPs |
| Analytics computed per request | Simple and always fresh; fine for thousands of responses | For millions: materialized views or counters updated on write, plus caching |
| Daily buckets in UTC | Simple | Bucket by the admin's timezone (`AT TIME ZONE`) |
| Hard delete (cascades to responses) | Simple | Soft delete (`deleted_at`) to allow recovery |
| Last write wins when the same draft is open in two tabs | Simple | Optimistic locking with `updated_at` → `409` |
| Free hosting | No cost for a demo | API cold start ~50 s; the free Postgres expires on **2026-12-18** (move to a paid plan or Neon) |
| PostCSS copy bundled inside Next.js is flagged by `npm audit` | Build-time only (it processes our own CSS); fixing it would force a Next.js major upgrade | Upgrade Next.js major when convenient. All runtime Next.js/React advisories are patched (15.5.29 / 19.1.10) |

## Run locally

Requirements: Docker, Go 1.26+, Node 20+.

```bash
# 1. Postgres + API (migrations run on startup, demo data is seeded)
docker compose up --build

# 2. Frontend
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

- Web: http://localhost:3000 (or 3001 if 3000 is taken; both are allowed by local CORS)
- API: http://localhost:8080/healthz
- Postgres is on host port **5433**
- Demo login: `demo@example.com` / `demo-pass-123`

Seed manually or reset the demo data:
```bash
cd apps/api
DATABASE_URL="postgres://survey:survey@localhost:5433/survey?sslmode=disable" go run ./cmd/seed          # idempotent
DATABASE_URL="postgres://survey:survey@localhost:5433/survey?sslmode=disable" go run ./cmd/seed -reset   # recreate
```

### Tests

```bash
cd apps/api && go test ./...   # auth, schema + answer validation, visibility, handlers, rate limiter, analytics, cursors
cd apps/web && npm test        # client-side schema/answer validation, visibility, builder helpers
```

## Deployment

- **API + database: Render** via [`render.yaml`](render.yaml) (Blueprint). It creates a free Postgres and a Docker web service in Singapore. `DATABASE_URL` comes from the database, Render generates `JWT_SECRET`, and `SEED_DEMO=true` loads the demo data on startup (idempotent). Health check: `/healthz`.
- **Frontend: Vercel**, root directory `apps/web`, with `NEXT_PUBLIC_API_URL=https://survey-builder-api.onrender.com`. Pushes to `main` redeploy automatically.
- The API's `ALLOWED_ORIGINS` is set to the Vercel production domain.

## Repository layout

```
apps/
  api/                     Go REST API
    cmd/server/            entrypoint (migrate → optional seed → serve, graceful shutdown)
    cmd/seed/              demo data CLI
    internal/
      auth/                bcrypt, JWT, RequireAdmin middleware
      config/              env config
      handlers/            HTTP: auth, surveys, public, analytics
      ratelimit/           token-bucket limiter middleware
      seed/                demo admin, survey (2 versions) and responses
      store/               all SQL (pgx), migrations runner
      survey/              schema types, schema validation, visibility, answer validation
    migrations/            SQL migrations (embedded in the binary)
  web/                     Next.js frontend
    src/app/               /login, /surveys, /surveys/[id] (builder), /surveys/[id]/analytics, /s/[slug]
    src/components/        builder/, form/, analytics/
    src/lib/               API client, types, schema + answer rules (mirrors of the Go rules)
docker-compose.yml         Postgres + API for local development
render.yaml                Render Blueprint (API + Postgres)
```

## What I'd do next

- **Partial responses:** an `in-progress` response with a resume token (the server validator already has a `partial` mode).
- CSV export, survey templates, AND/OR condition groups, more question types (date, number, matrix).
- Optimistic locking in the builder, soft delete, per-admin timezones in analytics.
- Redis-backed rate limiting; one response per device (signed cookie) or CAPTCHA for public surveys.
- An AI touch: summarise text answers with an LLM (async and cached, treating respondent text as untrusted input).
