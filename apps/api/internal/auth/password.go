package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(h), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// dummyHash is compared against when the email doesn't exist, so a login
// for an unknown email takes about as long as one with a wrong password.
// This avoids leaking which emails are registered through response timing.
var dummyHash, _ = HashPassword("timing-equaliser-not-a-real-password")

func CheckPasswordAgainstDummy(password string) {
	_ = CheckPassword(dummyHash, password)
}
