-- +goose Up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE surveys (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id           UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    slug               TEXT NOT NULL UNIQUE,
    status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'published', 'closed')),
    -- Working copy the builder edits. Published snapshots live in survey_versions.
    draft_schema       JSONB NOT NULL DEFAULT '{"questions": []}'::jsonb,
    current_version_id UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_surveys_admin ON surveys(admin_id);

-- Immutable snapshot of a survey's schema at publish time.
CREATE TABLE survey_versions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id  UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    version    INT  NOT NULL,
    schema     JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (survey_id, version)
);

ALTER TABLE surveys
    ADD CONSTRAINT fk_surveys_current_version
    FOREIGN KEY (current_version_id) REFERENCES survey_versions(id) ON DELETE SET NULL;

-- Responses are stored separately from schemas and pinned to the version answered.
CREATE TABLE responses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id         UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    survey_version_id UUID NOT NULL REFERENCES survey_versions(id) ON DELETE CASCADE,
    answers           JSONB NOT NULL DEFAULT '{}'::jsonb,
    status            TEXT NOT NULL DEFAULT 'complete'
                      CHECK (status IN ('partial', 'complete')),
    resume_token      TEXT,
    ip_hash           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at      TIMESTAMPTZ
);
CREATE INDEX idx_responses_survey_status ON responses(survey_id, status);

-- +goose Down
DROP TABLE responses;
ALTER TABLE surveys DROP CONSTRAINT fk_surveys_current_version;
DROP TABLE survey_versions;
DROP TABLE surveys;
DROP TABLE admins;
