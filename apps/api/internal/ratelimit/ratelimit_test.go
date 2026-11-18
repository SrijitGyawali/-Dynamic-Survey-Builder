package ratelimit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBurstThenBlock(t *testing.T) {
	l := New(context.Background(), 6, 3) // 3 burst, then 1 every 10s
	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("1.1.1.1"); !ok {
			t.Fatalf("request %d should pass", i+1)
		}
	}
	ok, wait := l.Allow("1.1.1.1")
	if ok {
		t.Fatal("4th request should be limited")
	}
	if wait <= 0 {
		t.Fatal("expected a positive wait")
	}
	// Other clients are unaffected.
	if ok, _ := l.Allow("2.2.2.2"); !ok {
		t.Fatal("a different IP must have its own bucket")
	}
}

func TestMiddleware(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	l := New(ctx, 60, 1)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	do := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req.RemoteAddr = "9.9.9.9:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	if rec := do(); rec.Code != http.StatusNoContent {
		t.Fatalf("first: %d", rec.Code)
	}
	rec := do()
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("second: %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("missing Retry-After header")
	}
}
