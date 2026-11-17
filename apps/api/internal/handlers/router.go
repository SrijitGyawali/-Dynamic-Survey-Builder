// Package handlers wires HTTP routes to the application logic.
package handlers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/srijitgyawali/survey-builder/api/internal/auth"
	"github.com/srijitgyawali/survey-builder/api/internal/config"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
)

type API struct {
	cfg   config.Config
	store *store.Store
}

func NewRouter(cfg config.Config, st *store.Store) http.Handler {
	api := &API{cfg: cfg, store: st}
	tokens := auth.NewTokenManager(cfg.JWTSecret)
	authH := &AuthHandler{admins: st, tokens: tokens}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(15 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: cfg.AllowedOrigins,
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Authorization", "Content-Type"},
		MaxAge:         300,
	}))

	r.Get("/healthz", api.health)

	r.Route("/api", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", authH.Register)
			r.Post("/login", authH.Login)
			r.With(tokens.RequireAdmin).Get("/me", authH.Me)
		})

		// Admin routes (JWT protected). Survey CRUD lands in phase 3.
		r.Group(func(r chi.Router) {
			r.Use(tokens.RequireAdmin)
		})

		// /public routes (no auth, rate limited) land in phase 6.
	})

	return r
}

func (a *API) health(w http.ResponseWriter, r *http.Request) {
	if err := a.store.Pool.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db_unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
