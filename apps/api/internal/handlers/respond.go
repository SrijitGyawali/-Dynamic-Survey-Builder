package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
)

const maxBodyBytes = 1 << 20 // 1 MiB

type errorBody struct {
	Error  string            `json:"error"`
	Fields map[string]string `json:"fields,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string, fields map[string]string) {
	writeJSON(w, status, errorBody{Error: msg, Fields: fields})
}

// decodeJSON reads a size-limited JSON body into dst, rejecting unknown fields.
// It writes a 400 and returns false on failure.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "request body too large", nil)
		} else {
			writeError(w, http.StatusBadRequest, "invalid JSON body", nil)
		}
		return false
	}
	return true
}
