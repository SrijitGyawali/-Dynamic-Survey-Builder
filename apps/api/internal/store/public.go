package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// PublicSurvey is what a respondent may see: only the published snapshot,
// never the draft.
type PublicSurvey struct {
	SurveyID    string
	Title       string
	Description string
	Slug        string
	Status      string
	VersionID   *string // nil if never published
	Version     *int
	Schema      []byte // JSONB of the current published version
}

func (s *Store) GetPublicSurvey(ctx context.Context, slug string) (PublicSurvey, error) {
	var p PublicSurvey
	err := s.Pool.QueryRow(ctx, `
		SELECT s.id, s.title, s.description, s.slug, s.status, v.id, v.version, v.schema
		FROM surveys s
		LEFT JOIN survey_versions v ON v.id = s.current_version_id
		WHERE s.slug = $1`, slug,
	).Scan(&p.SurveyID, &p.Title, &p.Description, &p.Slug, &p.Status, &p.VersionID, &p.Version, &p.Schema)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicSurvey{}, ErrNotFound
	}
	return p, err
}

// GetVersion loads a specific published version of a survey. Used when a
// respondent submits against the version they loaded, which may be older than
// the current one if the admin re-published while they were filling it in.
func (s *Store) GetVersion(ctx context.Context, surveyID string, version int) (id string, schema []byte, err error) {
	err = s.Pool.QueryRow(ctx,
		`SELECT id, schema FROM survey_versions WHERE survey_id = $1 AND version = $2`,
		surveyID, version,
	).Scan(&id, &schema)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrNotFound
	}
	return id, schema, err
}

func (s *Store) CreateResponse(ctx context.Context, surveyID, versionID string, answers []byte, ipHash string) (string, error) {
	var id string
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO responses (survey_id, survey_version_id, answers, status, ip_hash, submitted_at)
		VALUES ($1, $2, $3, 'complete', $4, now())
		RETURNING id`,
		surveyID, versionID, answers, ipHash,
	).Scan(&id)
	return id, err
}
