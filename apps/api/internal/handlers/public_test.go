package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/srijitgyawali/survey-builder/api/internal/store"
)

const v1Schema = `{"questions":[{"id":"q1","type":"single_choice","title":"Q","required":true,
  "options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}]}`
const v2Schema = `{"questions":[{"id":"q1","type":"text","title":"Q","required":true}]}`

type fakePublic struct {
	survey  store.PublicSurvey
	saved   []string // answers JSON stored
	savedOn []string // version id stored
}

func (f *fakePublic) GetPublicSurvey(_ context.Context, slug string) (store.PublicSurvey, error) {
	if slug != f.survey.Slug {
		return store.PublicSurvey{}, store.ErrNotFound
	}
	return f.survey, nil
}

func (f *fakePublic) GetVersion(_ context.Context, _ string, v int) (string, []byte, error) {
	if v == 1 {
		return "ver-1", []byte(v1Schema), nil
	}
	return "", nil, store.ErrNotFound
}

func (f *fakePublic) CreateResponse(_ context.Context, _, versionID string, answers []byte, _ string) (string, error) {
	f.saved = append(f.saved, string(answers))
	f.savedOn = append(f.savedOn, versionID)
	return "resp-1", nil
}

func newPublic(status string) (*PublicHandler, *fakePublic, http.Handler) {
	vid, ver := "ver-2", 2
	f := &fakePublic{survey: store.PublicSurvey{
		SurveyID: "s1", Title: "T", Slug: "my-survey", Status: status,
		VersionID: &vid, Version: &ver, Schema: []byte(v2Schema),
	}}
	h := &PublicHandler{repo: f, ipHashKey: []byte("k")}
	r := chi.NewRouter()
	r.Get("/s/{slug}", h.Get)
	r.Post("/s/{slug}", h.Submit)
	return h, f, r
}

func call(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "1.2.3.4:5555"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestPublicGet(t *testing.T) {
	for status, want := range map[string]int{
		"published": http.StatusOK,
		"draft":     http.StatusNotFound,
		"closed":    http.StatusGone,
	} {
		_, _, r := newPublic(status)
		if rec := call(r, "GET", "/s/my-survey", ""); rec.Code != want {
			t.Errorf("%s: got %d want %d", status, rec.Code, want)
		}
	}
	_, _, r := newPublic("published")
	if rec := call(r, "GET", "/s/nope", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown slug: %d", rec.Code)
	}
	rec := call(r, "GET", "/s/my-survey", "")
	if strings.Contains(rec.Body.String(), "draft") {
		t.Error("public payload must not expose the draft")
	}
}

func TestPublicSubmit(t *testing.T) {
	cases := []struct {
		name, body string
		want       int
	}{
		{"valid, current version", `{"version":2,"answers":{"q1":" hi "}}`, http.StatusCreated},
		{"valid, no version = current", `{"answers":{"q1":"hi"}}`, http.StatusCreated},
		{"missing required", `{"version":2,"answers":{}}`, http.StatusUnprocessableEntity},
		{"older version validated against its own schema", `{"version":1,"answers":{"q1":"a"}}`, http.StatusCreated},
		{"older version, wrong shape for it", `{"version":1,"answers":{"q1":"hi"}}`, http.StatusUnprocessableEntity},
		{"unknown version", `{"version":7,"answers":{"q1":"hi"}}`, http.StatusConflict},
		{"unknown field", `{"answers":{},"admin":true}`, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, r := newPublic("published")
			if rec := call(r, "POST", "/s/my-survey", tc.body); rec.Code != tc.want {
				t.Fatalf("got %d want %d: %s", rec.Code, tc.want, rec.Body)
			}
		})
	}
}

func TestSubmitStoresCleanAnswersOnTheRightVersion(t *testing.T) {
	_, f, r := newPublic("published")
	call(r, "POST", "/s/my-survey", `{"version":1,"answers":{"q1":"b"}}`)
	call(r, "POST", "/s/my-survey", `{"version":2,"answers":{"q1":"  trimmed  "}}`)
	if f.savedOn[0] != "ver-1" || f.savedOn[1] != "ver-2" {
		t.Fatalf("versions = %v", f.savedOn)
	}
	var a map[string]any
	_ = json.Unmarshal([]byte(f.saved[1]), &a)
	if a["q1"] != "trimmed" {
		t.Fatalf("answers not cleaned: %v", a)
	}
}

func TestSubmitErrorsAreKeyedByQuestion(t *testing.T) {
	_, _, r := newPublic("published")
	rec := call(r, "POST", "/s/my-survey", `{"answers":{"q1":""}}`)
	var body errorBody
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if body.Fields["answers.q1"] == "" {
		t.Fatalf("want answers.q1 error, got %v", body.Fields)
	}
}

func TestSubmitClosedOrDraft(t *testing.T) {
	for status, want := range map[string]int{"closed": http.StatusGone, "draft": http.StatusNotFound} {
		_, f, r := newPublic(status)
		if rec := call(r, "POST", "/s/my-survey", `{"answers":{"q1":"hi"}}`); rec.Code != want {
			t.Errorf("%s: got %d want %d", status, rec.Code, want)
		}
		if len(f.saved) != 0 {
			t.Errorf("%s: nothing should be stored", status)
		}
	}
}

func TestHoneypot(t *testing.T) {
	_, f, r := newPublic("published")
	rec := call(r, "POST", "/s/my-survey", `{"answers":{"q1":"buy pills"},"website":"http://spam"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("bots should see success, got %d", rec.Code)
	}
	if len(f.saved) != 0 {
		t.Fatal("honeypot submissions must not be stored")
	}
}
