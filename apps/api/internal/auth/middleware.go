package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type ctxKey struct{}

// Admin is the authenticated principal attached to the request context.
type Admin struct {
	ID    string
	Email string
}

// RequireAdmin rejects requests without a valid "Authorization: Bearer <jwt>" header.
func (m *TokenManager) RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			unauthorized(w)
			return
		}
		claims, err := m.Parse(token)
		if err != nil {
			unauthorized(w)
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, Admin{ID: claims.Subject, Email: claims.Email})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AdminFrom returns the admin set by RequireAdmin.
func AdminFrom(ctx context.Context) (Admin, bool) {
	a, ok := ctx.Value(ctxKey{}).(Admin)
	return a, ok
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("WWW-Authenticate", `Bearer realm="admin"`)
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
