package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Analytics are computed in Postgres with JSONB functions, so we never load
// every response into Go memory. All queries count COMPLETE responses only,
// and guard on jsonb_typeof: a question ID could have changed type between
// versions, and a type mismatch must be skipped rather than crash a cast.

// ResponseFilter narrows analytics to one survey, optionally one version.
type ResponseFilter struct {
	SurveyID  string
	VersionID *string // nil = all versions
}

// args are the $1 / $2 parameters that filterSQL refers to.
func (f ResponseFilter) args() []any { return []any{f.SurveyID, f.VersionID} }

// filterSQL restricts alias r to the filter. Every analytics query uses it.
const filterSQL = `r.survey_id = $1 AND r.status = 'complete'
  AND ($2::uuid IS NULL OR r.survey_version_id = $2::uuid)`

type ResponseSummary struct {
	Total        int
	LastResponse *time.Time
}

func (s *Store) ResponseSummary(ctx context.Context, f ResponseFilter) (ResponseSummary, error) {
	var out ResponseSummary
	err := s.Pool.QueryRow(ctx,
		`SELECT count(*), max(r.submitted_at) FROM responses r WHERE `+filterSQL, f.args()...,
	).Scan(&out.Total, &out.LastResponse)
	return out, err
}

type VersionCount struct {
	Version int
	Count   int
}

// CountsByVersion lists every published version with its response count (0 included).
func (s *Store) CountsByVersion(ctx context.Context, surveyID string) ([]VersionCount, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT v.version, count(r.id)
		FROM survey_versions v
		LEFT JOIN responses r ON r.survey_version_id = v.id AND r.status = 'complete'
		WHERE v.survey_id = $1
		GROUP BY v.version ORDER BY v.version`, surveyID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (VersionCount, error) {
		var vc VersionCount
		return vc, row.Scan(&vc.Version, &vc.Count)
	})
}

type DailyCount struct {
	Day   time.Time
	Count int
}

// DailyCounts returns one row per day for the last `days` days, zeros included
// (generate_series fills the gaps so the chart has no missing days).
func (s *Store) DailyCounts(ctx context.Context, f ResponseFilter, days int) ([]DailyCount, error) {
	rows, err := s.Pool.Query(ctx, `
		WITH d AS (
		  SELECT generate_series(current_date - ($3::int - 1), current_date, interval '1 day')::date AS day
		)
		SELECT d.day, count(r.id)
		FROM d
		LEFT JOIN responses r ON r.submitted_at::date = d.day AND `+filterSQL+`
		GROUP BY d.day ORDER BY d.day`, f.SurveyID, f.VersionID, days)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (DailyCount, error) {
		var dc DailyCount
		return dc, row.Scan(&dc.Day, &dc.Count)
	})
}

// AnsweredCounts: how many responses answered each question. Empty and hidden
// answers are never stored, so a key's presence means "answered".
func (s *Store) AnsweredCounts(ctx context.Context, f ResponseFilter) (map[string]int, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT a.key, count(*)
		FROM responses r CROSS JOIN LATERAL jsonb_each(r.answers) a
		WHERE `+filterSQL+`
		GROUP BY a.key`, f.args()...)
	if err != nil {
		return nil, err
	}
	return collectCounts(rows)
}

// OptionCounts counts choice answers per (question, option). Single choice is a
// string, multi choice an array; both are unnested into one row per option.
func (s *Store) OptionCounts(ctx context.Context, f ResponseFilter, questionIDs []string) (map[string]map[string]int, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT a.key, o.opt, count(*)
		FROM responses r
		CROSS JOIN LATERAL jsonb_each(r.answers) a
		CROSS JOIN LATERAL jsonb_array_elements_text(
		  CASE jsonb_typeof(a.value)
		    WHEN 'array'  THEN a.value
		    WHEN 'string' THEN jsonb_build_array(a.value)
		    ELSE '[]'::jsonb
		  END) AS o(opt)
		WHERE `+filterSQL+` AND a.key = ANY($3)
		GROUP BY a.key, o.opt`, f.SurveyID, f.VersionID, questionIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]int{}
	for rows.Next() {
		var q, opt string
		var n int
		if err := rows.Scan(&q, &opt, &n); err != nil {
			return nil, err
		}
		if out[q] == nil {
			out[q] = map[string]int{}
		}
		out[q][opt] = n
	}
	return out, rows.Err()
}

// RatingDistribution counts each rating value per question. The average is
// derived from this exactly (sum(value*count)/sum(count)), so one query
// serves both the mean and the histogram.
func (s *Store) RatingDistribution(ctx context.Context, f ResponseFilter, questionIDs []string) (map[string]map[int]int, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT a.key, (a.value)::int, count(*)
		FROM responses r CROSS JOIN LATERAL jsonb_each(r.answers) a
		WHERE `+filterSQL+` AND a.key = ANY($3) AND jsonb_typeof(a.value) = 'number'
		GROUP BY 1, 2`, f.SurveyID, f.VersionID, questionIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[int]int{}
	for rows.Next() {
		var q string
		var v, n int
		if err := rows.Scan(&q, &v, &n); err != nil {
			return nil, err
		}
		if out[q] == nil {
			out[q] = map[int]int{}
		}
		out[q][v] = n
	}
	return out, rows.Err()
}

type TextAnswer struct {
	ResponseID  string
	Answer      string
	SubmittedAt time.Time
}

// LatestTextAnswers returns the newest `limit` answers for each text question
// in one query, using a window function to rank answers per question.
func (s *Store) LatestTextAnswers(ctx context.Context, f ResponseFilter, questionIDs []string, limit int) (map[string][]TextAnswer, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT key, id, answer, submitted_at FROM (
		  SELECT a.key, r.id, a.value #>> '{}' AS answer, r.submitted_at,
		         row_number() OVER (PARTITION BY a.key ORDER BY r.submitted_at DESC, r.id DESC) AS rn
		  FROM responses r CROSS JOIN LATERAL jsonb_each(r.answers) a
		  WHERE `+filterSQL+` AND a.key = ANY($3) AND jsonb_typeof(a.value) = 'string'
		) t
		WHERE rn <= $4
		ORDER BY key, submitted_at DESC, id DESC`, f.SurveyID, f.VersionID, questionIDs, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]TextAnswer{}
	for rows.Next() {
		var q string
		var t TextAnswer
		if err := rows.Scan(&q, &t.ResponseID, &t.Answer, &t.SubmittedAt); err != nil {
			return nil, err
		}
		out[q] = append(out[q], t)
	}
	return out, rows.Err()
}

// TextAnswerCursor is the position after the last row of a page (keyset pagination).
type TextAnswerCursor struct {
	SubmittedAt time.Time
	ResponseID  string
}

// TextAnswersPage pages through one text question's answers, newest first.
// Keyset pagination ("rows older than the last one I saw") stays fast and
// stable on deep pages, unlike OFFSET, which rescans skipped rows and can
// show duplicates when new responses arrive between page loads.
func (s *Store) TextAnswersPage(ctx context.Context, f ResponseFilter, questionID string, after *TextAnswerCursor, limit int) ([]TextAnswer, error) {
	var afterTime *time.Time
	var afterID *string
	if after != nil {
		afterTime, afterID = &after.SubmittedAt, &after.ResponseID
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT r.id, r.answers->>$3, r.submitted_at
		FROM responses r
		WHERE `+filterSQL+`
		  AND jsonb_typeof(r.answers->$3) = 'string'
		  AND ($4::timestamptz IS NULL OR (r.submitted_at, r.id) < ($4::timestamptz, $5::uuid))
		ORDER BY r.submitted_at DESC, r.id DESC
		LIMIT $6`, f.SurveyID, f.VersionID, questionID, afterTime, afterID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (TextAnswer, error) {
		var t TextAnswer
		return t, row.Scan(&t.ResponseID, &t.Answer, &t.SubmittedAt)
	})
}

// GetVersionByNumber resolves a version number for an admin's survey.
func (s *Store) GetVersionByNumber(ctx context.Context, adminID, surveyID string, version int) (id string, schema []byte, err error) {
	err = s.Pool.QueryRow(ctx, `
		SELECT v.id, v.schema FROM survey_versions v
		JOIN surveys s ON s.id = v.survey_id
		WHERE v.survey_id = $1 AND s.admin_id = $2 AND v.version = $3`,
		surveyID, adminID, version).Scan(&id, &schema)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrNotFound
	}
	return id, schema, err
}

// GetCurrentSchema returns the published schema of an admin's survey (nil if never published).
func (s *Store) GetCurrentSchema(ctx context.Context, adminID, surveyID string) ([]byte, error) {
	var schema []byte
	err := s.Pool.QueryRow(ctx, `
		SELECT v.schema FROM surveys s
		LEFT JOIN survey_versions v ON v.id = s.current_version_id
		WHERE s.id = $1 AND s.admin_id = $2`, surveyID, adminID).Scan(&schema)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return schema, err
}

func collectCounts(rows pgx.Rows) (map[string]int, error) {
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}
