package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-that-is-at-least-32-characters"

func TestIssueAndParse(t *testing.T) {
	m := NewTokenManager(testSecret)
	tok, exp, err := m.Issue("admin-1", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if time.Until(exp) < 23*time.Hour {
		t.Fatalf("expiry too short: %v", exp)
	}
	c, err := m.Parse(tok)
	if err != nil {
		t.Fatal(err)
	}
	if c.Subject != "admin-1" || c.Email != "a@example.com" {
		t.Fatalf("unexpected claims: %+v", c)
	}
}

func TestParseRejects(t *testing.T) {
	m := NewTokenManager(testSecret)
	good, _, _ := m.Issue("admin-1", "a@example.com")

	expired := NewTokenManager(testSecret)
	expired.now = func() time.Time { return time.Now().Add(-48 * time.Hour) }
	expiredTok, _, _ := expired.Issue("admin-1", "a@example.com")

	otherSecret, _, _ := NewTokenManager("a-completely-different-secret-value-xx").Issue("admin-1", "a@example.com")

	noneTok, _ := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "admin-1", Issuer: issuer,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}).SignedString(jwt.UnsafeAllowNoneSignatureType)

	cases := map[string]string{
		"empty":        "",
		"garbage":      "not.a.jwt",
		"tampered":     good[:len(good)-2] + "xx",
		"expired":      expiredTok,
		"wrong secret": otherSecret,
		"alg none":     noneTok,
	}
	for name, tok := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := m.Parse(tok); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func TestPassword(t *testing.T) {
	h, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(h, "correct horse") {
		t.Fatal("correct password rejected")
	}
	if CheckPassword(h, "wrong") {
		t.Fatal("wrong password accepted")
	}
}

func TestRequireAdmin(t *testing.T) {
	m := NewTokenManager(testSecret)
	tok, _, _ := m.Issue("admin-1", "a@example.com")

	h := m.RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a, ok := AdminFrom(r.Context())
		if !ok || a.ID != "admin-1" {
			t.Errorf("admin not in context: %+v", a)
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	cases := []struct {
		name   string
		header string
		want   int
	}{
		{"no header", "", http.StatusUnauthorized},
		{"wrong scheme", "Basic " + tok, http.StatusUnauthorized},
		{"bad token", "Bearer nope", http.StatusUnauthorized},
		{"valid", "Bearer " + tok, http.StatusNoContent},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("got %d want %d", rec.Code, tc.want)
			}
		})
	}
}
