// Package handlers wires HTTP routes to the application logic.
package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/srijitgyawali/survey-builder/api/internal/auth"
	"github.com/srijitgyawali/survey-builder/api/internal/config"
	"github.com/srijitgyawali/survey-builder/api/internal/ratelimit"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
)

type API struct {
	cfg   config.Config
	store *store.Store
}

// NewRouter builds the HTTP handler. ctx controls background work
// (rate-limiter cleanup) and should be cancelled on shutdown.
func NewRouter(ctx context.Context, cfg config.Config, st *store.Store) http.Handler {
	api := &API{cfg: cfg, store: st}
	tokens := auth.NewTokenManager(cfg.JWTSecret)
	authH := &AuthHandler{admins: st, tokens: tokens}
	surveyH := &SurveyHandler{surveys: st}
	analyticsH := &AnalyticsHandler{store: st}
	publicH := &PublicHandler{repo: st, ipHashKey: []byte("ip-hash:" + cfg.JWTSecret)}

	// Separate buckets per purpose, per client IP.
	authLimit := ratelimit.New(ctx, 10, 10)  // login/register: brute-force protection
	readLimit := ratelimit.New(ctx, 120, 60) // loading public surveys
	submitLimit := ratelimit.New(ctx, 10, 5) // submitting responses: spam protection

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	// RealIP trusts X-Forwarded-For / X-Real-IP. Correct behind a proxy
	// (Render, Fly), where the proxy sets these; see README trade-offs.
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
			r.With(authLimit.Middleware).Post("/register", authH.Register)
			r.With(authLimit.Middleware).Post("/login", authH.Login)
			r.With(tokens.RequireAdmin).Get("/me", authH.Me)
		})

		// Admin routes (JWT protected).
		r.Route("/surveys", func(r chi.Router) {
			r.Use(tokens.RequireAdmin)
			r.Get("/", surveyH.List)
			r.Post("/", surveyH.Create)
			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", surveyH.Get)
				r.Put("/", surveyH.Update)
				r.Delete("/", surveyH.Delete)
				r.Post("/publish", surveyH.Publish)
				r.Post("/close", surveyH.Close)
				r.Get("/versions", surveyH.Versions)
				r.Get("/analytics", analyticsH.Summary)
				r.Get("/analytics/questions/{qid}/answers", analyticsH.TextAnswers)
			})
		})

		// Public routes (no auth, rate limited).
		r.Route("/public/surveys/{slug}", func(r chi.Router) {
			r.With(readLimit.Middleware).Get("/", publicH.Get)
			r.With(submitLimit.Middleware).Post("/responses", publicH.Submit)
		})
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
