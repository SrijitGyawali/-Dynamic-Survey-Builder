// Package ratelimit provides a per-client token-bucket limiter as HTTP middleware.
//
// Token bucket: each client has a bucket that holds up to `burst` tokens and
// refills at `rate` tokens per second. Each request takes one token; with an
// empty bucket the request gets 429. This allows short bursts but caps the
// sustained rate.
//
// Limitations (documented trade-off): state is in memory, so it resets on
// restart and isn't shared between multiple API instances. A Redis-backed
// limiter would fix both.
package ratelimit

import (
	"context"
	"encoding/json"
	"math"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type Limiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     rate.Limit
	burst    int
	idleTTL  time.Duration
}

// New creates a limiter allowing `perMinute` requests per minute per client,
// with bursts of up to `burst`. Idle clients are forgotten after 10 minutes
// by a background sweeper that stops when ctx is cancelled.
func New(ctx context.Context, perMinute float64, burst int) *Limiter {
	l := &Limiter{
		visitors: map[string]*visitor{},
		rate:     rate.Limit(perMinute / 60),
		burst:    burst,
		idleTTL:  10 * time.Minute,
	}
	go l.sweep(ctx)
	return l
}

// Allow reports whether a request from key may proceed, and if not, how long
// until a token is available.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	v, ok := l.visitors[key]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.visitors[key] = v
	}
	v.lastSeen = time.Now()
	l.mu.Unlock()

	r := v.limiter.Reserve()
	if d := r.Delay(); d > 0 {
		r.Cancel() // don't consume a token we aren't using
		return false, d
	}
	return true, 0
}

// Middleware limits by client IP. It relies on chi's RealIP middleware running
// first so RemoteAddr is the real client IP behind a proxy.
func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, wait := l.Allow(ClientIP(r))
		if !ok {
			secs := int(math.Ceil(wait.Seconds()))
			w.Header().Set("Retry-After", strconv.Itoa(secs))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "too many requests, please try again in " + strconv.Itoa(secs) + "s",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (l *Limiter) sweep(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			l.mu.Lock()
			for k, v := range l.visitors {
				if now.Sub(v.lastSeen) > l.idleTTL {
					delete(l.visitors, k)
				}
			}
			l.mu.Unlock()
		}
	}
}

// ClientIP strips the port from RemoteAddr ("1.2.3.4:5678" -> "1.2.3.4").
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
