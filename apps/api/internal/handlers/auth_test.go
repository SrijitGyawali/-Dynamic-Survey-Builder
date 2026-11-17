package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/srijitgyawali/survey-builder/api/internal/auth"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
)

type fakeAdmins struct {
	mu   sync.Mutex
	byEm map[string]store.Admin
}

func newFakeAdmins() *fakeAdmins { return &fakeAdmins{byEm: map[string]store.Admin{}} }

func (f *fakeAdmins) CreateAdmin(_ context.Context, email, hash string) (store.Admin, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.byEm[email]; ok {
		return store.Admin{}, store.ErrDuplicate
	}
	a := store.Admin{ID: "id-" + email, Email: email, PasswordHash: hash}
	f.byEm[email] = a
	return a, nil
}

func (f *fakeAdmins) GetAdminByEmail(_ context.Context, email string) (store.Admin, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a, ok := f.byEm[email]
	if !ok {
		return store.Admin{}, store.ErrNotFound
	}
	return a, nil
}

func newTestAuth() (*AuthHandler, *auth.TokenManager) {
	tm := auth.NewTokenManager("test-secret-that-is-at-least-32-characters")
	return &AuthHandler{admins: newFakeAdmins(), tokens: tm}, tm
}

func post(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestRegisterValidation(t *testing.T) {
	h, _ := newTestAuth()
	cases := []struct {
		name, body string
		want       int
	}{
		{"bad json", `{`, http.StatusBadRequest},
		{"unknown field", `{"email":"a@b.co","password":"password1","role":"root"}`, http.StatusBadRequest},
		{"bad email", `{"email":"nope","password":"password1"}`, http.StatusUnprocessableEntity},
		{"short password", `{"email":"a@b.co","password":"short"}`, http.StatusUnprocessableEntity},
		{"ok", `{"email":"  A@B.co ","password":"password1"}`, http.StatusCreated},
		{"duplicate (case-insensitive)", `{"email":"a@b.co","password":"password1"}`, http.StatusConflict},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := post(h.Register, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("got %d want %d: %s", rec.Code, tc.want, rec.Body)
			}
		})
	}
}

func TestLoginFlow(t *testing.T) {
	h, tm := newTestAuth()
	if rec := post(h.Register, `{"email":"admin@x.io","password":"password1"}`); rec.Code != http.StatusCreated {
		t.Fatalf("register: %d", rec.Code)
	}

	for name, body := range map[string]string{
		"wrong password": `{"email":"admin@x.io","password":"password2"}`,
		"unknown email":  `{"email":"ghost@x.io","password":"password1"}`,
	} {
		t.Run(name, func(t *testing.T) {
			rec := post(h.Login, body)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("got %d", rec.Code)
			}
			if !strings.Contains(rec.Body.String(), "invalid email or password") {
				t.Fatalf("error should not reveal which part was wrong: %s", rec.Body)
			}
		})
	}

	rec := post(h.Login, `{"email":"ADMIN@x.io","password":"password1"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}
	var resp authResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(rec.Body.String(), "password") {
		t.Fatal("response must not include the password hash")
	}

	// The issued token must pass the middleware and reach /me.
	if _, err := tm.Parse(resp.Token); err != nil {
		t.Fatalf("issued token invalid: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer "+resp.Token)
	meRec := httptest.NewRecorder()
	tm.RequireAdmin(http.HandlerFunc(h.Me)).ServeHTTP(meRec, req)
	if meRec.Code != http.StatusOK || !strings.Contains(meRec.Body.String(), "admin@x.io") {
		t.Fatalf("me: %d %s", meRec.Code, meRec.Body)
	}
}
