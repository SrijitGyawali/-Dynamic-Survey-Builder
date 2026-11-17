// Package auth handles password hashing, JWT issuing/verification and
// the HTTP middleware that protects admin routes.
package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	issuer   = "survey-builder"
	TokenTTL = 24 * time.Hour
)

var ErrInvalidToken = errors.New("invalid token")

// Claims carried inside the admin JWT. Subject holds the admin ID.
type Claims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

type TokenManager struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time
}

func NewTokenManager(secret string) *TokenManager {
	return &TokenManager{secret: []byte(secret), ttl: TokenTTL, now: time.Now}
}

// Issue signs an HS256 token for the given admin.
func (m *TokenManager) Issue(adminID, email string) (string, time.Time, error) {
	now := m.now()
	exp := now.Add(m.ttl)
	claims := Claims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   adminID,
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, exp, nil
}

// Parse verifies signature, algorithm, issuer and expiry, and returns the claims.
func (m *TokenManager) Parse(token string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(token, claims,
		func(t *jwt.Token) (any, error) { return m.secret, nil },
		// Pinning the algorithm blocks "alg: none" and algorithm-confusion attacks.
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(m.now),
	)
	if err != nil || claims.Subject == "" {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
