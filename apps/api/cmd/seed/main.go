// Command seed loads the demo data (see internal/seed).
//
//	DATABASE_URL=... go run ./cmd/seed            # idempotent: skips if the demo survey exists
//	DATABASE_URL=... go run ./cmd/seed -reset     # delete the demo survey and recreate it
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"os"

	"github.com/srijitgyawali/survey-builder/api/internal/seed"
	"github.com/srijitgyawali/survey-builder/api/internal/store"
)

func main() {
	reset := flag.Bool("reset", false, "delete and recreate the demo survey")
	flag.Parse()
	if err := run(*reset); err != nil {
		log.Fatal(err)
	}
}

func run(reset bool) error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	if err := store.Migrate(dbURL); err != nil {
		return err
	}
	ctx := context.Background()
	st, err := store.New(ctx, dbURL)
	if err != nil {
		return err
	}
	defer st.Close()
	return seed.Run(ctx, st, reset)
}
