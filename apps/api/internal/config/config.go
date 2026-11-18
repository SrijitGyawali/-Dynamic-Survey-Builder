// Package config loads runtime settings from environment variables.
package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	AllowedOrigins []string
	// SeedDemo loads the demo survey and responses on startup (idempotent).
	SeedDemo bool
	// The single admin account, created on startup if it doesn't exist yet.
	AdminEmail    string
	AdminPassword string
	// AllowRegistration enables POST /api/auth/register. Off unless "true".
	AllowRegistration bool
}

func Load() (Config, error) {
	cfg := Config{
		Port:              getEnv("PORT", "8080"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		AllowedOrigins:    splitList(getEnv("ALLOWED_ORIGINS", "http://localhost:3000")),
		SeedDemo:          os.Getenv("SEED_DEMO") == "true",
		AdminEmail:        strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL"))),
		AdminPassword:     os.Getenv("ADMIN_PASSWORD"),
		AllowRegistration: os.Getenv("ALLOW_REGISTRATION") == "true",
	}
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return cfg, errors.New("JWT_SECRET must be at least 32 characters")
	}
	if (cfg.AdminEmail == "") != (cfg.AdminPassword == "") {
		return cfg, errors.New("set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither")
	}
	if cfg.AdminPassword != "" && (len(cfg.AdminPassword) < 8 || len(cfg.AdminPassword) > 72) {
		return cfg, errors.New("ADMIN_PASSWORD must be 8-72 characters")
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// splitList splits "a, b,,c" into ["a" "b" "c"].
func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
