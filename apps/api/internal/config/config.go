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
}

func Load() (Config, error) {
	cfg := Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		AllowedOrigins: strings.Split(getEnv("ALLOWED_ORIGINS", "http://localhost:3000"), ","),
	}
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return cfg, errors.New("JWT_SECRET must be at least 32 characters")
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
