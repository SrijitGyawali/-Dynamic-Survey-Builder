package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/srijitgyawali/survey-builder/api/internal/ratelimit"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
	"github.com/srijitgyawali/survey-builder/api/internal/survey"
)

type publicRepo interface {
	ListListedSurveys(ctx context.Context, limit int) ([]store.ListedSurvey, error)
	GetPublicSurvey(ctx context.Context, slug string) (store.PublicSurvey, error)
	GetVersion(ctx context.Context, surveyID string, version int) (string, []byte, error)
	CreateResponse(ctx context.Context, surveyID, versionID string, answers []byte, ipHash string) (string, error)
}

// PublicHandler serves surveys to respondents. No authentication.
type PublicHandler struct {
	repo      publicRepo
	ipHashKey []byte
}

type publicSurveyDTO struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Slug        string          `json:"slug"`
	Version     int             `json:"version"`
	Schema      json.RawMessage `json:"schema"`
}

type submitInput struct {
	// The version the respondent loaded. 0 means "current".
	Version int            `json:"version"`
	Answers map[string]any `json:"answers"`
	// Honeypot: a hidden form field humans never fill. Bots that fill every
	// input reveal themselves here.
	Website string `json:"website"`
}

type listedSurveyDTO struct {
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	Slug          string    `json:"slug"`
	QuestionCount int       `json:"questionCount"`
	PublishedAt   time.Time `json:"publishedAt"`
}

const maxListed = 50

// List serves the homepage: published surveys whose admin chose "Show on homepage".
func (h *PublicHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.repo.ListListedSurveys(r.Context(), maxListed)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]listedSurveyDTO, len(list))
	for i, l := range list {
		out[i] = listedSurveyDTO{l.Title, l.Description, l.Slug, l.QuestionCount, l.PublishedAt}
	}
	// No caching: publishing or toggling "Show on homepage" must show up immediately.
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, out)
}

// loadOpen returns the survey if it's accepting responses, or writes 404/410.
func (h *PublicHandler) loadOpen(w http.ResponseWriter, r *http.Request) (store.PublicSurvey, bool) {
	p, err := h.repo.GetPublicSurvey(r.Context(), chi.URLParam(r, "slug"))
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "survey not found", nil)
		return p, false
	case err != nil:
		internalError(w, err)
		return p, false
	}
	// Drafts are invisible to the public: same 404 as a missing survey.
	if p.Status == "draft" || p.VersionID == nil {
		writeError(w, http.StatusNotFound, "survey not found", nil)
		return p, false
	}
	if p.Status == "closed" {
		writeError(w, http.StatusGone, "this survey is closed and no longer accepts responses", nil)
		return p, false
	}
	return p, true
}

func (h *PublicHandler) Get(w http.ResponseWriter, r *http.Request) {
	p, ok := h.loadOpen(w, r)
	if !ok {
		return
	}
	// Don't let browsers or CDNs cache it: closing or re-publishing must take effect immediately.
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, publicSurveyDTO{
		Title: p.Title, Description: p.Description, Slug: p.Slug,
		Version: *p.Version, Schema: p.Schema,
	})
}

func (h *PublicHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var in submitInput
	if !decodeJSON(w, r, &in) {
		return
	}

	// Spam trap: pretend success so the bot doesn't adapt, but store nothing.
	if in.Website != "" {
		slog.Info("honeypot triggered", "slug", chi.URLParam(r, "slug"))
		writeJSON(w, http.StatusCreated, map[string]string{"id": ""})
		return
	}

	p, ok := h.loadOpen(w, r)
	if !ok {
		return
	}

	// Validate against the version the respondent actually saw.
	versionID, rawSchema := *p.VersionID, []byte(p.Schema)
	if in.Version != 0 && in.Version != *p.Version {
		id, schema, err := h.repo.GetVersion(r.Context(), p.SurveyID, in.Version)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusConflict, "this survey has changed, please reload the page", nil)
			return
		}
		if err != nil {
			internalError(w, err)
			return
		}
		versionID, rawSchema = id, schema
	}

	var schema survey.Schema
	if err := json.Unmarshal(rawSchema, &schema); err != nil {
		internalError(w, err)
		return
	}

	clean, errs := survey.ValidateAnswers(schema, in.Answers, false)
	if len(errs) > 0 {
		fields := make(map[string]string, len(errs))
		for qid, msg := range errs {
			fields["answers."+qid] = msg
		}
		writeError(w, http.StatusUnprocessableEntity, "please fix the highlighted answers", fields)
		return
	}

	answers, err := json.Marshal(clean)
	if err != nil {
		internalError(w, err)
		return
	}
	id, err := h.repo.CreateResponse(r.Context(), p.SurveyID, versionID, answers, h.hashIP(ratelimit.ClientIP(r)))
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// hashIP stores a keyed hash instead of the raw IP: enough to spot abuse from
// one source, without keeping personal data in the database.
func (h *PublicHandler) hashIP(ip string) string {
	m := hmac.New(sha256.New, h.ipHashKey)
	m.Write([]byte(ip))
	return hex.EncodeToString(m.Sum(nil))[:32]
}
