package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/srijitgyawali/survey-builder/api/internal/auth"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
)

// adminRepo is the subset of the store the auth handlers need.
// Defined here so handler tests can use an in-memory fake.
type adminRepo interface {
	CreateAdmin(ctx context.Context, email, passwordHash string) (store.Admin, error)
	GetAdminByEmail(ctx context.Context, email string) (store.Admin, error)
}

type AuthHandler struct {
	admins adminRepo
	tokens *auth.TokenManager
	// allowRegistration is off in production: the single admin is created at
	// deploy time from ADMIN_EMAIL / ADMIN_PASSWORD (see cmd/server).
	allowRegistration bool
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	Admin     adminDTO  `json:"admin"`
}

type adminDTO struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

const (
	minPasswordLen = 8
	maxPasswordLen = 72 // bcrypt ignores bytes beyond 72
)

func (c *credentials) normalise() {
	c.Email = strings.ToLower(strings.TrimSpace(c.Email))
}

func (c credentials) validate() map[string]string {
	fields := map[string]string{}
	if addr, err := mail.ParseAddress(c.Email); err != nil || addr.Address != c.Email {
		fields["email"] = "must be a valid email address"
	}
	switch {
	case len(c.Password) < minPasswordLen:
		fields["password"] = "must be at least 8 characters"
	case len(c.Password) > maxPasswordLen:
		fields["password"] = "must be at most 72 characters"
	}
	return fields
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.allowRegistration {
		writeError(w, http.StatusForbidden, "registration is disabled", nil)
		return
	}
	var in credentials
	if !decodeJSON(w, r, &in) {
		return
	}
	in.normalise()
	if fields := in.validate(); len(fields) > 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation failed", fields)
		return
	}

	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		internalError(w, err)
		return
	}
	admin, err := h.admins.CreateAdmin(r.Context(), in.Email, hash)
	if errors.Is(err, store.ErrDuplicate) {
		writeError(w, http.StatusConflict, "email already registered", map[string]string{"email": "already registered"})
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	h.respondWithToken(w, http.StatusCreated, admin)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if !decodeJSON(w, r, &in) {
		return
	}
	in.normalise()

	admin, err := h.admins.GetAdminByEmail(r.Context(), in.Email)
	switch {
	case errors.Is(err, store.ErrNotFound):
		auth.CheckPasswordAgainstDummy(in.Password)
		writeError(w, http.StatusUnauthorized, "invalid email or password", nil)
		return
	case err != nil:
		internalError(w, err)
		return
	}
	// Same message for unknown email and wrong password: don't reveal which emails exist.
	if !auth.CheckPassword(admin.PasswordHash, in.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password", nil)
		return
	}
	h.respondWithToken(w, http.StatusOK, admin)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	a, ok := auth.AdminFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", nil)
		return
	}
	writeJSON(w, http.StatusOK, adminDTO{ID: a.ID, Email: a.Email})
}

func (h *AuthHandler) respondWithToken(w http.ResponseWriter, status int, a store.Admin) {
	token, exp, err := h.tokens.Issue(a.ID, a.Email)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, status, authResponse{
		Token:     token,
		ExpiresAt: exp,
		Admin:     adminDTO{ID: a.ID, Email: a.Email},
	})
}

func internalError(w http.ResponseWriter, err error) {
	slog.Error("internal error", "err", err)
	writeError(w, http.StatusInternalServerError, "internal server error", nil)
}
