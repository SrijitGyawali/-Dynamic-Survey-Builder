package store

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrInvalidState means the action isn't allowed in the survey's current status.
var ErrInvalidState = errors.New("invalid state")

type Survey struct {
	ID          string
	Title       string
	Description string
	Slug        string
	Status      string
	DraftSchema []byte // raw JSONB
	// Version number of the published snapshot, nil if never published.
	CurrentVersion *int
	// True when the draft differs from the published snapshot.
	HasUnpublishedChanges bool
	QuestionCount         int
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type SurveyVersion struct {
	Version       int
	QuestionCount int
	CreatedAt     time.Time
}

// Every survey query filters on admin_id, so an admin can never read or
// change another admin's survey. "Not yours" and "doesn't exist" both
// return ErrNotFound (404), which avoids leaking which IDs exist.
const surveySelect = `
SELECT s.id, s.title, s.description, s.slug, s.status, s.draft_schema,
       v.version,
       (v.id IS NULL OR s.draft_schema IS DISTINCT FROM v.schema) AS has_changes,
       COALESCE(jsonb_array_length(s.draft_schema->'questions'), 0),
       s.created_at, s.updated_at
FROM surveys s
LEFT JOIN survey_versions v ON v.id = s.current_version_id`

func scanSurvey(row pgx.Row) (Survey, error) {
	var s Survey
	err := row.Scan(&s.ID, &s.Title, &s.Description, &s.Slug, &s.Status, &s.DraftSchema,
		&s.CurrentVersion, &s.HasUnpublishedChanges, &s.QuestionCount, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Survey{}, ErrNotFound
	}
	return s, err
}

func (s *Store) ListSurveys(ctx context.Context, adminID string) ([]Survey, error) {
	rows, err := s.Pool.Query(ctx, surveySelect+` WHERE s.admin_id = $1 ORDER BY s.updated_at DESC`, adminID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Survey{}
	for rows.Next() {
		sv, err := scanSurvey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sv)
	}
	return out, rows.Err()
}

func (s *Store) GetSurvey(ctx context.Context, adminID, id string) (Survey, error) {
	return scanSurvey(s.Pool.QueryRow(ctx, surveySelect+` WHERE s.id = $1 AND s.admin_id = $2`, id, adminID))
}

func (s *Store) CreateSurvey(ctx context.Context, adminID, title, description string) (Survey, error) {
	// Slugs are random-suffixed, so a clash is very unlikely. Retry a few times anyway.
	for attempt := 0; attempt < 3; attempt++ {
		var id string
		err := s.Pool.QueryRow(ctx,
			`INSERT INTO surveys (admin_id, title, description, slug)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			adminID, title, description, makeSlug(title),
		).Scan(&id)
		if isUniqueViolation(err) {
			continue
		}
		if err != nil {
			return Survey{}, err
		}
		return s.GetSurvey(ctx, adminID, id)
	}
	return Survey{}, errors.New("could not generate a unique slug")
}

func (s *Store) UpdateSurvey(ctx context.Context, adminID, id, title, description string, draft []byte) (Survey, error) {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE surveys SET title = $3, description = $4, draft_schema = $5, updated_at = now()
		 WHERE id = $1 AND admin_id = $2`,
		id, adminID, title, description, draft)
	if err != nil {
		return Survey{}, err
	}
	if tag.RowsAffected() == 0 {
		return Survey{}, ErrNotFound
	}
	return s.GetSurvey(ctx, adminID, id)
}

func (s *Store) DeleteSurvey(ctx context.Context, adminID, id string) error {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM surveys WHERE id = $1 AND admin_id = $2`, id, adminID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// PublishSurvey snapshots the current draft into survey_versions and marks the
// survey published, all in one transaction.
//
//   - validate is called with the draft read INSIDE the transaction (row locked),
//     so the snapshot is exactly what was validated, even if the admin saves again
//     at the same moment.
//   - If the draft is identical to the latest published version, no new version
//     is created; the survey is just (re)marked published. This also reopens a
//     closed survey.
//
// Returns created=true when a new version row was written.
func (s *Store) PublishSurvey(ctx context.Context, adminID, id string, validate func(draft []byte) error) (created bool, err error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx) // no-op after Commit

	var (
		draft     []byte
		unchanged bool
	)
	err = tx.QueryRow(ctx, `
		SELECT s.draft_schema, (v.id IS NOT NULL AND v.schema = s.draft_schema)
		FROM surveys s
		LEFT JOIN survey_versions v ON v.id = s.current_version_id
		WHERE s.id = $1 AND s.admin_id = $2
		FOR UPDATE OF s`, id, adminID).Scan(&draft, &unchanged)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	if err != nil {
		return false, err
	}

	if err := validate(draft); err != nil {
		return false, err
	}

	if unchanged {
		_, err = tx.Exec(ctx,
			`UPDATE surveys SET status = 'published', updated_at = now() WHERE id = $1`, id)
	} else {
		var versionID string
		err = tx.QueryRow(ctx, `
			INSERT INTO survey_versions (survey_id, version, schema)
			VALUES ($1, COALESCE((SELECT MAX(version) FROM survey_versions WHERE survey_id = $1), 0) + 1, $2)
			RETURNING id`, id, draft).Scan(&versionID)
		if err == nil {
			_, err = tx.Exec(ctx, `
				UPDATE surveys SET current_version_id = $2, status = 'published', updated_at = now()
				WHERE id = $1`, id, versionID)
		}
		created = true
	}
	if err != nil {
		return false, err
	}
	return created, tx.Commit(ctx)
}

// CloseSurvey stops a published survey from accepting responses.
func (s *Store) CloseSurvey(ctx context.Context, adminID, id string) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE surveys SET status = 'closed', updated_at = now()
		 WHERE id = $1 AND admin_id = $2 AND status = 'published'`, id, adminID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if _, err := s.GetSurvey(ctx, adminID, id); err != nil {
			return err // ErrNotFound
		}
		return ErrInvalidState // exists, but isn't published
	}
	return nil
}

func (s *Store) ListVersions(ctx context.Context, adminID, id string) ([]SurveyVersion, error) {
	if _, err := s.GetSurvey(ctx, adminID, id); err != nil {
		return nil, err
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT version, COALESCE(jsonb_array_length(schema->'questions'), 0), created_at
		FROM survey_versions WHERE survey_id = $1 ORDER BY version DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []SurveyVersion{}
	for rows.Next() {
		var v SurveyVersion
		if err := rows.Scan(&v.Version, &v.QuestionCount, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

// makeSlug turns "Customer Feedback 2026!" into "customer-feedback-2026-k3x9q2".
// The random suffix keeps public URLs unguessable-ish and unique.
func makeSlug(title string) string {
	base := strings.Trim(nonSlugChars.ReplaceAllString(strings.ToLower(title), "-"), "-")
	if len(base) > 40 {
		base = strings.TrimRight(base[:40], "-")
	}
	if base == "" {
		base = "survey"
	}
	return fmt.Sprintf("%s-%s", base, randomSuffix(6))
}

const slugAlphabet = "abcdefghijkmnpqrstuvwxyz23456789" // no look-alikes (l/1, o/0)

func randomSuffix(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = slugAlphabet[int(b[i])%len(slugAlphabet)]
	}
	return string(b)
}
