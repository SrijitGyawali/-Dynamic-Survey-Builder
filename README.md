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

## Authentication

Admin routes use a **JWT** (HS256, 24h expiry), sent as `Authorization: Bearer <token>`.

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | `{email, password}` → `201 {token, expiresAt, admin}` |
| `POST /api/auth/login` | `{email, password}` → `200 {token, expiresAt, admin}` |
| `GET /api/auth/me` | Current admin (requires token) |

- Passwords are hashed with **bcrypt** (cost 12).
- The token parser only accepts HS256 and checks the issuer and expiry, so `alg: none` and forged tokens are rejected.
- Login returns the same error for an unknown email and a wrong password. For unknown emails it still runs a bcrypt comparison, so response timing doesn't reveal which emails are registered.
- Emails are normalised (trimmed and lower-cased). Request bodies are size-limited and unknown JSON fields are rejected.

**Token storage trade-off:** the frontend keeps the token in `localStorage` rather than an httpOnly cookie. The web app and the API are deployed on different domains, and cross-site cookies are increasingly blocked by browsers. The cost is that an XSS bug could read the token. The 24h expiry limits that window. With a shared parent domain, an httpOnly `SameSite` cookie would be the stronger choice.

## Survey API (admin, JWT required)

| Endpoint | Description |
|----------|-------------|
| `GET /api/surveys` | List your surveys (no schema payload) |
| `POST /api/surveys` | `{title, description}` → `201` new draft survey |
| `GET /api/surveys/:id` | Survey with its draft schema |
| `PUT /api/surveys/:id` | `{title, description, draftSchema}`: save the draft |
| `DELETE /api/surveys/:id` | `204`, also deletes its versions and responses |
| `POST /api/surveys/:id/publish` | Snapshot the draft as a new version (`201`), or reuse the current one if nothing changed (`200`). Also reopens a closed survey |
| `POST /api/surveys/:id/close` | Stop accepting responses (`409` if not published) |
| `GET /api/surveys/:id/versions` | Published versions, newest first |

### Draft → publish → versions

The builder always edits `surveys.draft_schema`. Respondents only ever see a **published version**, an immutable row in `survey_versions`. Publishing runs in one transaction:

1. Lock the survey row (`SELECT … FOR UPDATE`) and read the draft.
2. Validate it (at least one question, schema rules below).
3. If it equals the current version's schema, just mark the survey `published`. Otherwise insert version `max + 1` and point `current_version_id` at it.

Responses are pinned to the version that was answered, so editing a survey later never corrupts old data.

### Schema validation rules

- Unique, non-empty question IDs and option IDs (stable IDs, not array positions, so reordering never breaks stored answers).
- Choice questions need 2–50 options. Rating defaults to 1–5 (max 10).
- **Conditional logic** (`showIf`) may only reference an **earlier** question. That rules out cycles and lets visibility be computed in one top-to-bottom pass. The operator must fit the target: `equals` for single choice, `includes` for multi choice, `equals`/`gte`/`lte` for rating. The value must be a real option ID or an in-range rating. Text questions can't be conditions.
- Errors come back as `422` with field paths, e.g. `draftSchema.questions[1].showIf.questionId`.

### Survey builder (frontend)

- Add, duplicate, delete and **reorder** questions: drag handle (mouse, touch or keyboard: Space, then the arrow keys) plus ↑/↓ buttons. Built with `@dnd-kit`.
- Switching a question's type keeps what still applies (e.g. options when going single → multi choice).
- **"Show only if…"** offers only *earlier* choice or rating questions, and the operator and value pickers adapt to the target type.
- The validation rules are mirrored in TypeScript (`src/lib/schema.ts`) for instant inline errors. The API re-validates everything. A reorder that breaks a condition is flagged immediately rather than silently dropped. Deleting a question clears conditions that depended on it, after a confirmation.
- Unsaved changes are tracked, leaving the page warns, and **Publish** saves first so you publish exactly what you see.

### Ownership

Every query filters on `admin_id`. Another admin's survey returns **404** rather than 403, so IDs can't be probed. Malformed IDs also return 404.

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

### Tests

```bash
cd apps/api && go test ./...   # auth, schema validation, slugs, handlers
cd apps/web && npm test        # client-side validation + builder helpers
```

To run the API without Docker, start only the DB (`docker compose up db`), copy `apps/api/.env.example` to `.env`, export the variables and run `go run ./cmd/server` from `apps/api`.
