package handlers

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/sync/errgroup"

	"github.com/srijitgyawali/survey-builder/api/internal/auth"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
	"github.com/srijitgyawali/survey-builder/api/internal/survey"
)

const (
	dailyWindowDays   = 30
	latestTextAnswers = 5
	maxTextPage       = 50
)

type AnalyticsHandler struct {
	store *store.Store
}

// ---- DTOs ----

type analyticsDTO struct {
	SurveyID       string          `json:"surveyId"`
	Title          string          `json:"title"`
	Status         string          `json:"status"`
	Version        *int            `json:"version"` // filter applied, null = all versions
	CurrentVersion *int            `json:"currentVersion"`
	TotalResponses int             `json:"totalResponses"`
	LastResponseAt *time.Time      `json:"lastResponseAt"`
	ByVersion      []versionCount  `json:"byVersion"`
	Daily          []dailyCount    `json:"daily"`
	Questions      []questionStats `json:"questions"`
}

type versionCount struct {
	Version int `json:"version"`
	Count   int `json:"count"`
}

type dailyCount struct {
	Date  string `json:"date"` // YYYY-MM-DD
	Count int    `json:"count"`
}

type questionStats struct {
	ID          string       `json:"id"`
	Title       string       `json:"title"`
	Type        string       `json:"type"`
	Required    bool         `json:"required"`
	Conditional bool         `json:"conditional"`
	Answered    int          `json:"answered"`
	Options     []optionStat `json:"options,omitempty"`
	Rating      *ratingStat  `json:"rating,omitempty"`
	Text        *textStat    `json:"text,omitempty"`
}

type optionStat struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

type ratingStat struct {
	Min          int          `json:"min"`
	Max          int          `json:"max"`
	Average      *float64     `json:"average"` // null when no ratings yet
	Distribution []valueCount `json:"distribution"`
}

type valueCount struct {
	Value int `json:"value"`
	Count int `json:"count"`
}

type textStat struct {
	Latest []textAnswerDTO `json:"latest"`
}

type textAnswerDTO struct {
	ResponseID  string    `json:"responseId"`
	Answer      string    `json:"answer"`
	SubmittedAt time.Time `json:"submittedAt"`
}

// RemovedOptionsID labels votes for options that exist in older versions but
// not in the schema being shown, so totals still add up honestly.
const RemovedOptionsID = "__removed__"

// ---- GET /api/surveys/{id}/analytics?version=N ----

func (h *AnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	admin, _ := auth.AdminFrom(ctx)
	id, ok := surveyID(w, r)
	if !ok {
		return
	}
	sv, err := h.store.GetSurvey(ctx, admin.ID, id)
	if writeStoreError(w, err) {
		return
	}

	filter, rawSchema, version, ok := h.resolveVersion(w, r, admin.ID, id)
	if !ok {
		return
	}

	out := analyticsDTO{
		SurveyID: sv.ID, Title: sv.Title, Status: sv.Status,
		Version: version, CurrentVersion: sv.CurrentVersion,
		ByVersion: []versionCount{}, Daily: []dailyCount{}, Questions: []questionStats{},
	}
	if rawSchema == nil { // never published: nothing to analyse
		writeJSON(w, http.StatusOK, out)
		return
	}
	var schema survey.Schema
	if err := json.Unmarshal(rawSchema, &schema); err != nil {
		internalError(w, err)
		return
	}

	var choiceIDs, ratingIDs, textIDs []string
	for _, q := range schema.Questions {
		switch q.Type {
		case survey.TypeSingleChoice, survey.TypeMultiChoice:
			choiceIDs = append(choiceIDs, q.ID)
		case survey.TypeRating:
			ratingIDs = append(ratingIDs, q.ID)
		case survey.TypeText:
			textIDs = append(textIDs, q.ID)
		}
	}

	// The queries are independent, so run them concurrently on the pool.
	// errgroup cancels the rest if one fails and returns the first error.
	var (
		summary  store.ResponseSummary
		byVer    []store.VersionCount
		daily    []store.DailyCount
		answered map[string]int
		options  map[string]map[string]int
		ratings  map[string]map[int]int
		texts    map[string][]store.TextAnswer
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { summary, err = h.store.ResponseSummary(gctx, filter); return })
	g.Go(func() (err error) { byVer, err = h.store.CountsByVersion(gctx, id); return })
	g.Go(func() (err error) { daily, err = h.store.DailyCounts(gctx, filter, dailyWindowDays); return })
	g.Go(func() (err error) { answered, err = h.store.AnsweredCounts(gctx, filter); return })
	g.Go(func() (err error) { options, err = h.store.OptionCounts(gctx, filter, choiceIDs); return })
	g.Go(func() (err error) { ratings, err = h.store.RatingDistribution(gctx, filter, ratingIDs); return })
	g.Go(func() (err error) {
		texts, err = h.store.LatestTextAnswers(gctx, filter, textIDs, latestTextAnswers)
		return
	})
	if err := g.Wait(); err != nil {
		internalError(w, err)
		return
	}

	out.TotalResponses = summary.Total
	out.LastResponseAt = summary.LastResponse
	for _, v := range byVer {
		out.ByVersion = append(out.ByVersion, versionCount{v.Version, v.Count})
	}
	for _, d := range daily {
		out.Daily = append(out.Daily, dailyCount{d.Day.Format("2006-01-02"), d.Count})
	}
	out.Questions = buildQuestionStats(schema, answered, options, ratings, texts)
	writeJSON(w, http.StatusOK, out)
}

// buildQuestionStats turns raw counts into per-question stats, in schema order.
// Pure function: no I/O, so it's unit-tested directly.
func buildQuestionStats(
	schema survey.Schema,
	answered map[string]int,
	options map[string]map[string]int,
	ratings map[string]map[int]int,
	texts map[string][]store.TextAnswer,
) []questionStats {
	out := make([]questionStats, 0, len(schema.Questions))
	for _, q := range schema.Questions {
		qs := questionStats{
			ID: q.ID, Title: q.Title, Type: string(q.Type), Required: q.Required,
			Conditional: q.ShowIf != nil, Answered: answered[q.ID],
		}
		switch q.Type {
		case survey.TypeSingleChoice, survey.TypeMultiChoice:
			counts := options[q.ID]
			removed := 0
			known := map[string]bool{}
			qs.Options = make([]optionStat, 0, len(q.Options)+1)
			for _, o := range q.Options {
				known[o.ID] = true
				qs.Options = append(qs.Options, optionStat{ID: o.ID, Label: o.Label, Count: counts[o.ID]})
			}
			for optID, n := range counts {
				if !known[optID] {
					removed += n
				}
			}
			if removed > 0 {
				qs.Options = append(qs.Options, optionStat{
					ID: RemovedOptionsID, Label: "Options removed in a later version", Count: removed,
				})
			}

		case survey.TypeRating:
			lo, hi := survey.DefaultRatingLo, survey.DefaultRatingHi
			if q.Min != nil {
				lo = *q.Min
			}
			if q.Max != nil {
				hi = *q.Max
			}
			dist := ratings[q.ID]
			rs := &ratingStat{Min: lo, Max: hi, Distribution: make([]valueCount, 0, hi-lo+1)}
			sum, n := 0, 0
			for v := lo; v <= hi; v++ { // every value, zeros included
				rs.Distribution = append(rs.Distribution, valueCount{v, dist[v]})
			}
			for v, c := range dist { // average uses all stored ratings
				sum += v * c
				n += c
			}
			if n > 0 {
				avg := math.Round(float64(sum)/float64(n)*100) / 100
				rs.Average = &avg
			}
			qs.Rating = rs

		case survey.TypeText:
			latest := make([]textAnswerDTO, 0, len(texts[q.ID]))
			for _, t := range texts[q.ID] {
				latest = append(latest, textAnswerDTO{t.ResponseID, t.Answer, t.SubmittedAt})
			}
			qs.Text = &textStat{Latest: latest}
		}
		out = append(out, qs)
	}
	return out
}

// ---- GET /api/surveys/{id}/analytics/questions/{qid}/answers?version=&cursor=&limit= ----

type textPageDTO struct {
	Answers    []textAnswerDTO `json:"answers"`
	NextCursor *string         `json:"nextCursor"` // null when there are no more
}

func (h *AnalyticsHandler) TextAnswers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	admin, _ := auth.AdminFrom(ctx)
	id, ok := surveyID(w, r)
	if !ok {
		return
	}
	if _, err := h.store.GetSurvey(ctx, admin.ID, id); writeStoreError(w, err) {
		return
	}
	filter, _, _, ok := h.resolveVersion(w, r, admin.ID, id)
	if !ok {
		return
	}

	limit := 20
	if s := r.URL.Query().Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > maxTextPage {
			writeError(w, http.StatusBadRequest, "limit must be between 1 and 50", nil)
			return
		}
		limit = n
	}
	var after *store.TextAnswerCursor
	if s := r.URL.Query().Get("cursor"); s != "" {
		c, err := decodeCursor(s)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid cursor", nil)
			return
		}
		after = &c
	}

	// Fetch one extra row to know whether another page exists.
	rows, err := h.store.TextAnswersPage(ctx, filter, chi.URLParam(r, "qid"), after, limit+1)
	if err != nil {
		internalError(w, err)
		return
	}
	out := textPageDTO{Answers: []textAnswerDTO{}}
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		c := encodeCursor(store.TextAnswerCursor{SubmittedAt: last.SubmittedAt, ResponseID: last.ResponseID})
		out.NextCursor = &c
	}
	for _, t := range rows {
		out.Answers = append(out.Answers, textAnswerDTO{t.ResponseID, t.Answer, t.SubmittedAt})
	}
	writeJSON(w, http.StatusOK, out)
}

// resolveVersion reads ?version=N. Without it: all versions, current schema.
// Returns (filter, schema to describe questions, version filter, ok).
func (h *AnalyticsHandler) resolveVersion(w http.ResponseWriter, r *http.Request, adminID, id string) (store.ResponseFilter, []byte, *int, bool) {
	filter := store.ResponseFilter{SurveyID: id}
	s := r.URL.Query().Get("version")
	if s == "" {
		schema, err := h.store.GetCurrentSchema(r.Context(), adminID, id)
		if writeStoreError(w, err) {
			return filter, nil, nil, false
		}
		return filter, schema, nil, true
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		writeError(w, http.StatusBadRequest, "version must be a positive number", nil)
		return filter, nil, nil, false
	}
	vid, schema, err := h.store.GetVersionByNumber(r.Context(), adminID, id, n)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "version not found", nil)
		return filter, nil, nil, false
	}
	if err != nil {
		internalError(w, err)
		return filter, nil, nil, false
	}
	filter.VersionID = &vid
	return filter, schema, &n, true
}

// Cursors are opaque to the client: base64 of {t, id}.
type cursorJSON struct {
	T  time.Time `json:"t"`
	ID string    `json:"id"`
}

func encodeCursor(c store.TextAnswerCursor) string {
	b, _ := json.Marshal(cursorJSON{c.SubmittedAt, c.ResponseID})
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeCursor(s string) (store.TextAnswerCursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return store.TextAnswerCursor{}, err
	}
	var c cursorJSON
	if err := json.Unmarshal(b, &c); err != nil || c.ID == "" || !uuidRe.MatchString(c.ID) {
		return store.TextAnswerCursor{}, errors.New("bad cursor")
	}
	return store.TextAnswerCursor{SubmittedAt: c.T, ResponseID: c.ID}, nil
}
