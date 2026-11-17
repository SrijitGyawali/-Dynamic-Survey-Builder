package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrDuplicate = errors.New("already exists")
)

type Admin struct {
	ID           string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

func (s *Store) CreateAdmin(ctx context.Context, email, passwordHash string) (Admin, error) {
	var a Admin
	err := s.Pool.QueryRow(ctx,
		`INSERT INTO admins (email, password_hash) VALUES ($1, $2)
		 RETURNING id, email, password_hash, created_at`,
		email, passwordHash,
	).Scan(&a.ID, &a.Email, &a.PasswordHash, &a.CreatedAt)
	if isUniqueViolation(err) {
		return Admin{}, ErrDuplicate
	}
	return a, err
}

func (s *Store) GetAdminByEmail(ctx context.Context, email string) (Admin, error) {
	var a Admin
	err := s.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM admins WHERE email = $1`,
		email,
	).Scan(&a.ID, &a.Email, &a.PasswordHash, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Admin{}, ErrNotFound
	}
	return a, err
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
