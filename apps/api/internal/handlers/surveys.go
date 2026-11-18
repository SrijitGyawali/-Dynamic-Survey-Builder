package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"github.com/srijitgyawali/survey-builder/api/internal/auth"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
	"github.com/srijitgyawali/survey-builder/api/internal/survey"
)

type surveyRepo interface {
	ListSurveys(ctx context.Context, adminID string) ([]store.Survey, error)
	GetSurvey(ctx context.Context, adminID, id string) (store.Survey, error)
	CreateSurvey(ctx context.Context, adminID, title, description string) (store.Survey, error)
	UpdateSurvey(ctx context.Context, adminID, id, title, description string, draft []byte) (store.Survey, error)
	DeleteSurvey(ctx context.Context, adminID, id string) error
	PublishSurvey(ctx context.Context, adminID, id string, validate func([]byte) error) (bool, error)
	CloseSurvey(ctx context.Context, adminID, id string) error
	ListVersions(ctx context.Context, adminID, id string) ([]store.SurveyVersion, error)
}

type SurveyHandler struct {
	surveys surveyRepo
}

// ---- DTOs (the JSON shape the frontend sees) ----

type surveyDTO struct {
	ID                    string          `json:"id"`
	Title                 string          `json:"title"`
	Description           string          `json:"description"`
	Slug                  string          `json:"slug"`
	Status                string          `json:"status"`
	DraftSchema           json.RawMessage `json:"draftSchema,omitempty"`
	CurrentVersion        *int            `json:"currentVersion"`
	HasUnpublishedChanges bool            `json:"hasUnpublishedChanges"`
	QuestionCount         int             `json:"questionCount"`
	CreatedAt             time.Time       `json:"createdAt"`
	UpdatedAt             time.Time       `json:"updatedAt"`
}

func toDTO(s store.Survey, withSchema bool) surveyDTO {
	d := surveyDTO{
		ID: s.ID, Title: s.Title, Description: s.Description, Slug: s.Slug, Status: s.Status,
		CurrentVersion: s.CurrentVersion, HasUnpublishedChanges: s.HasUnpublishedChanges,
		QuestionCount: s.QuestionCount, CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt,
	}
	if withSchema {
		d.DraftSchema = s.DraftSchema
	}
	return d
}

type versionDTO struct {
	Version       int       `json:"version"`
	QuestionCount int       `json:"questionCount"`
	CreatedAt     time.Time `json:"createdAt"`
}

// ---- input ----

type surveyMeta struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type updateSurveyInput struct {
	surveyMeta
	DraftSchema *survey.Schema `json:"draftSchema"`
}

const (
	maxSurveyTitle = 200
	maxSurveyDesc  = 2000
)

func (m *surveyMeta) normaliseAndValidate(fields map[string]string) {
	m.Title = strings.TrimSpace(m.Title)
	m.Description = strings.TrimSpace(m.Description)
	if m.Title == "" {
		fields["title"] = "is required"
	} else if utf8.RuneCountInString(m.Title) > maxSurveyTitle {
		fields["title"] = "must be at most 200 characters"
	}
	if utf8.RuneCountInString(m.Description) > maxSurveyDesc {
		fields["description"] = "must be at most 2000 characters"
	}
}

// ---- handlers ----

func (h *SurveyHandler) List(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	list, err := h.surveys.ListSurveys(r.Context(), admin.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]surveyDTO, len(list))
	for i, s := range list {
		out[i] = toDTO(s, false) // list view: no schema payload
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *SurveyHandler) Create(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	var in surveyMeta
	if !decodeJSON(w, r, &in) {
		return
	}
	fields := map[string]string{}
	in.normaliseAndValidate(fields)
	if len(fields) > 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation failed", fields)
		return
	}
	s, err := h.surveys.CreateSurvey(r.Context(), admin.ID, in.Title, in.Description)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toDTO(s, true))
}

func (h *SurveyHandler) Get(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	id, ok := surveyID(w, r)
	if !ok {
		return
	}
	s, err := h.surveys.GetSurvey(r.Context(), admin.ID, id)
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, toDTO(s, true))
}

// Update replaces title, description and the draft schema. Saving a draft
// never affects the published version; that only changes on publish.
func (h *SurveyHandler) Update(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	id, ok := surveyID(w, r)
	if !ok {
		return
	}
	var in updateSurveyInput
	if !decodeJSON(w, r, &in) {
		return
	}

	fields := map[string]string{}
	in.normaliseAndValidate(fields)
	if in.DraftSchema == nil {
		fields["draftSchema"] = "is required"
	} else {
		in.DraftSchema.Normalize()
		for k, v := range in.DraftSchema.Validate() {
			fields["draftSchema."+k] = v
		}
	}
	if len(fields) > 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation failed", fields)
		return
	}

	draft, err := json.Marshal(in.DraftSchema) // canonical, normalised JSON
	if err != nil {
		internalError(w, err)
		return
	}
	s, err := h.surveys.UpdateSurvey(r.Context(), admin.ID, id, in.Title, in.Description, draft)
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, toDTO(s, true))
}

func (h *SurveyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	id, ok := surveyID(w, r)
	if !ok {
		return
	}
	if writeStoreError(w, h.surveys.DeleteSurvey(r.Context(), admin.ID, id)) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// errNotPublishable carries field errors out of the publish transaction.
type errNotPublishable struct{ fields map[string]string }

func (e errNotPublishable) Error() string { return "survey cannot be published" }

func (h *SurveyHandler) Publish(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	id, ok := surveyID(w, r)
	if !ok {
		return
	}

	created, err := h.surveys.PublishSurvey(r.Context(), admin.ID, id, func(draft []byte) error {
		var s survey.Schema
		if err := json.Unmarshal(draft, &s); err != nil {
			return err
		}
		s.Normalize()
		fields := map[string]string{}
		for k, v := range s.Validate() {
			fields["draftSchema."+k] = v
		}
		if len(s.Questions) == 0 {
			fields["draftSchema.questions"] = "add at least one question before publishing"
		}
		if len(fields) > 0 {
			return errNotPublishable{fields}
		}
		return nil
	})

	var np errNotPublishable
	if errors.As(err, &np) {
		writeError(w, http.StatusUnprocessableEntity, "survey cannot be published", np.fields)
		return
	}
	if writeStoreError(w, err) {
		return
	}

	s, err := h.surveys.GetSurvey(r.Context(), admin.ID, id)
	if writeStoreError(w, err) {
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, toDTO(s, true))
}

func (h *SurveyHandler) Close(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	id, ok := surveyID(w, r)
	if !ok {
		return
	}
	err := h.surveys.CloseSurvey(r.Context(), admin.ID, id)
	if errors.Is(err, store.ErrInvalidState) {
		writeError(w, http.StatusConflict, "only a published survey can be closed", nil)
		return
	}
	if writeStoreError(w, err) {
		return
	}
	s, err := h.surveys.GetSurvey(r.Context(), admin.ID, id)
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, toDTO(s, true))
}

func (h *SurveyHandler) Versions(w http.ResponseWriter, r *http.Request) {
	admin, _ := auth.AdminFrom(r.Context())
	id, ok := surveyID(w, r)
	if !ok {
		return
	}
	list, err := h.surveys.ListVersions(r.Context(), admin.ID, id)
	if writeStoreError(w, err) {
		return
	}
	out := make([]versionDTO, len(list))
	for i, v := range list {
		out[i] = versionDTO{Version: v.Version, QuestionCount: v.QuestionCount, CreatedAt: v.CreatedAt}
	}
	writeJSON(w, http.StatusOK, out)
}

// ---- helpers ----

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// surveyID reads {id} from the URL. A malformed ID is treated as "not found"
// rather than letting Postgres raise a type error.
func surveyID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := chi.URLParam(r, "id")
	if !uuidRe.MatchString(id) {
		writeError(w, http.StatusNotFound, "survey not found", nil)
		return "", false
	}
	return id, true
}

// writeStoreError maps store errors to HTTP responses. Returns true if it wrote one.
func writeStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "survey not found", nil)
	default:
		internalError(w, err)
	}
	return true
}
