// Package seed creates a demo admin, a demo survey with conditional logic and
// two published versions, and realistic responses spread over recent weeks.
//
// Used by cmd/seed (manual) and by the server when SEED_DEMO=true (hosted demo,
// where free hosting plans have no shell to run a one-off command).
//
// Responses are generated, then passed through survey.ValidateAnswers, so the
// seeded data obeys exactly the same rules as real submissions.
package seed

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/srijitgyawali/survey-builder/api/internal/auth"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
	"github.com/srijitgyawali/survey-builder/api/internal/survey"
)

// DemoSlug is the public URL slug of the demo survey: /s/customer-satisfaction-demo.
const DemoSlug = "customer-satisfaction-demo"

const demoSlug = DemoSlug // short alias used below

// Run seeds the demo data. It is idempotent: if the demo survey already exists
// it does nothing, unless reset is true (then the demo survey is recreated).
// The demo survey belongs to the single admin from ADMIN_EMAIL / ADMIN_PASSWORD
// (defaults: demo@example.com / demo-pass-123), which is created if missing
// and never overwritten.
func Run(ctx context.Context, st *store.Store, reset bool) error {
	email := strings.ToLower(strings.TrimSpace(envOr("ADMIN_EMAIL", "demo@example.com")))
	password := envOr("ADMIN_PASSWORD", "demo-pass-123")

	adminID, err := EnsureAdmin(ctx, st, email, password)
	if err != nil {
		return err
	}

	var existing string
	err = st.Pool.QueryRow(ctx, `SELECT id FROM surveys WHERE slug = $1`, demoSlug).Scan(&existing)
	switch {
	case err == nil && !reset:
		slog.Info("demo survey already exists, skipping seed", "slug", demoSlug)
		return nil
	case err == nil && reset:
		if _, err := st.Pool.Exec(ctx, `DELETE FROM surveys WHERE id = $1`, existing); err != nil {
			return err
		}
	case !errors.Is(err, pgx.ErrNoRows):
		return err
	}

	tx, err := st.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var surveyID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO surveys (admin_id, title, description, slug, status, listed, created_at)
		VALUES ($1, 'Customer Satisfaction', 'A short survey about how you use the product. Takes about 2 minutes.', $2, 'published', true, now() - interval '30 days')
		RETURNING id`, adminID, demoSlug).Scan(&surveyID); err != nil {
		return err
	}

	rng := rand.New(rand.NewPCG(42, 2026)) // fixed seed: same demo data every time
	total := 0
	for i, def := range []struct {
		schema      survey.Schema
		responses   int
		daysAgoFrom int
		daysAgoTo   int
	}{
		{schemaV1(), 42, 28, 10},
		{schemaV2(), 26, 9, 0},
	} {
		def.schema.Normalize()
		if errs := def.schema.Validate(); len(errs) > 0 {
			return fmt.Errorf("demo schema v%d invalid: %v", i+1, errs)
		}
		raw, _ := json.Marshal(def.schema)

		var versionID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO survey_versions (survey_id, version, schema, created_at)
			VALUES ($1, $2, $3, now() - make_interval(days => $4))
			RETURNING id`, surveyID, i+1, raw, def.daysAgoFrom+1).Scan(&versionID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE surveys SET current_version_id = $2, draft_schema = $3, updated_at = now() WHERE id = $1`,
			surveyID, versionID, raw); err != nil {
			return err
		}

		for n := 0; n < def.responses; n++ {
			clean, errs := survey.ValidateAnswers(def.schema, generateAnswers(rng, def.schema), false)
			if len(errs) > 0 {
				return fmt.Errorf("generated invalid answers: %v", errs)
			}
			answers, _ := json.Marshal(clean)
			// Bias towards recent days, random time of day.
			daysAgo := def.daysAgoTo + int(float64(def.daysAgoFrom-def.daysAgoTo)*rng.Float64()*rng.Float64())
			at := time.Now().Add(-time.Duration(daysAgo)*24*time.Hour - time.Duration(rng.IntN(20*60))*time.Minute)
			if _, err := tx.Exec(ctx, `
				INSERT INTO responses (survey_id, survey_version_id, answers, status, created_at, submitted_at)
				VALUES ($1, $2, $3, 'complete', $4, $4)`, surveyID, versionID, answers, at); err != nil {
				return err
			}
			total++
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	slog.Info("seeded demo data", "admin", email, "survey", "/s/"+demoSlug, "versions", 2, "responses", total)
	return nil
}

// EnsureAdmin returns the admin with this email, creating it if it doesn't
// exist. An existing admin's password is never changed. Used on startup to
// create the single admin account (public registration is disabled).
func EnsureAdmin(ctx context.Context, st *store.Store, email, password string) (string, error) {
	a, err := st.GetAdminByEmail(ctx, email)
	if err == nil {
		return a.ID, nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return "", err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return "", err
	}
	a, err = st.CreateAdmin(ctx, email, hash)
	return a.ID, err
}

// ---- demo survey ----

func opt(id, label string) survey.Option { return survey.Option{ID: id, Label: label} }

func schemaV1() survey.Schema {
	return survey.Schema{Questions: []survey.Question{
		{ID: "q_role", Type: survey.TypeSingleChoice, Title: "What best describes you?", Required: true,
			Options: []survey.Option{opt("student", "Student"), opt("developer", "Developer"), opt("designer", "Designer"), opt("manager", "Manager")}},
		{ID: "q_freq", Type: survey.TypeSingleChoice, Title: "How often do you use the product?", Required: true,
			Options: []survey.Option{opt("daily", "Daily"), opt("weekly", "Weekly"), opt("monthly", "Monthly"), opt("rarely", "Rarely")}},
		{ID: "q_sat", Type: survey.TypeRating, Title: "Overall, how satisfied are you?", Required: true},
		{ID: "q_low", Type: survey.TypeText, Title: "Sorry to hear that. What went wrong?", Required: true,
			ShowIf: &survey.Condition{QuestionID: "q_sat", Operator: survey.OpLTE, Value: 2.0}},
		{ID: "q_features", Type: survey.TypeMultiChoice, Title: "Which features do you use?",
			Options: []survey.Option{opt("builder", "Survey builder"), opt("logic", "Conditional logic"), opt("analytics", "Analytics"), opt("links", "Public links")}},
		{ID: "q_analytics", Type: survey.TypeRating, Title: "How useful are the analytics?",
			ShowIf: &survey.Condition{QuestionID: "q_features", Operator: survey.OpIncludes, Value: "analytics"}},
		{ID: "q_recommend", Type: survey.TypeSingleChoice, Title: "Would you recommend us to a friend?", Required: true,
			Options: []survey.Option{opt("yes", "Yes"), opt("maybe", "Maybe"), opt("no", "No")}},
		{ID: "q_more", Type: survey.TypeText, Title: "Anything else you would like to tell us?"},
	}}
}

// v2 replaces "Manager" with "Team lead": the all-versions view then shows the
// old votes under "Options removed in a later version".
func schemaV2() survey.Schema {
	s := schemaV1()
	s.Questions[0].Options[3] = opt("team_lead", "Team lead")
	return s
}

// generateAnswers produces plausible answers for every question; the
// validator then drops the ones that would be hidden.
func generateAnswers(r *rand.Rand, s survey.Schema) map[string]any {
	pick := func(weights map[string]int) string {
		sum := 0
		for _, w := range weights {
			sum += w
		}
		n := r.IntN(sum)
		for _, k := range sortedKeys(weights) {
			if n < weights[k] {
				return k
			}
			n -= weights[k]
		}
		return ""
	}
	sat := []float64{1, 2, 3, 4, 4, 4, 5, 5, 5, 5, 3, 4}[r.IntN(12)]
	features := []any{}
	for _, f := range []struct {
		id string
		p  float64
	}{{"builder", 0.9}, {"logic", 0.55}, {"analytics", 0.6}, {"links", 0.75}} {
		if r.Float64() < f.p {
			features = append(features, f.id)
		}
	}
	rec := "yes"
	switch {
	case sat <= 2:
		rec = pick(map[string]int{"no": 6, "maybe": 3, "yes": 1})
	case sat == 3:
		rec = pick(map[string]int{"maybe": 6, "yes": 3, "no": 1})
	default:
		rec = pick(map[string]int{"yes": 8, "maybe": 2})
	}
	// Roles come from this version's options (v1 has Manager, v2 has Team lead).
	roleWeights := map[string]int{}
	for _, o := range s.Questions[0].Options {
		roleWeights[o.ID] = map[string]int{"student": 3, "developer": 5, "designer": 2}[o.ID]
		if roleWeights[o.ID] == 0 {
			roleWeights[o.ID] = 2
		}
	}
	a := map[string]any{
		"q_role":      pick(roleWeights),
		"q_freq":      pick(map[string]int{"daily": 4, "weekly": 5, "monthly": 2, "rarely": 1}),
		"q_sat":       sat,
		"q_low":       lowComments[r.IntN(len(lowComments))],
		"q_features":  features,
		"q_analytics": float64(3 + r.IntN(3)),
		"q_recommend": rec,
	}
	if r.Float64() < 0.45 {
		a["q_more"] = moreComments[r.IntN(len(moreComments))]
	}
	return a
}

var lowComments = []string{
	"The builder was confusing the first time I used it.",
	"Publishing changes took me a while to find.",
	"I expected more question types, like dates.",
	"Charts were hard to read on my phone.",
	"Got rate limited while testing with my team.",
}

var moreComments = []string{
	"Conditional logic is exactly what I needed.",
	"Please add CSV export.",
	"Love how fast it is.",
	"Would be great to have templates.",
	"Dark mode please!",
	"The public link works nicely on mobile.",
	"Easy to set up, my students filled it in minutes.",
	"Versioning saved me when I edited a live survey.",
}

func sortedKeys(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := 1; i < len(keys); i++ { // tiny insertion sort: deterministic order for the fixed seed
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
