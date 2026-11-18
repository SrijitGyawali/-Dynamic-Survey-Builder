-- +goose Up
-- Per-survey choice: show a published survey on the public homepage, or keep it
-- reachable only by its link. Off by default, so nothing becomes public by surprise.
ALTER TABLE surveys ADD COLUMN listed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_surveys_public_listing ON surveys (updated_at DESC)
    WHERE status = 'published' AND listed;

-- The demo survey is meant to be discoverable.
UPDATE surveys SET listed = true WHERE slug = 'customer-satisfaction-demo';

-- +goose Down
DROP INDEX idx_surveys_public_listing;
ALTER TABLE surveys DROP COLUMN listed;
