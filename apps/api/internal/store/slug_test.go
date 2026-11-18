package store

import (
	"regexp"
	"strings"
	"testing"
)

func TestMakeSlug(t *testing.T) {
	cases := map[string]string{
		"Customer Feedback 2026!": "customer-feedback-2026-",
		"  ***  ":                 "survey-",
		"Ünïcode & spaces":        "n-code-spaces-",
		strings.Repeat("a", 100):  strings.Repeat("a", 40) + "-",
	}
	suffix := regexp.MustCompile(`^[a-z0-9]{6}$`)
	for title, prefix := range cases {
		got := makeSlug(title)
		if !strings.HasPrefix(got, prefix) {
			t.Errorf("makeSlug(%q) = %q, want prefix %q", title, got, prefix)
			continue
		}
		if !suffix.MatchString(strings.TrimPrefix(got, prefix)) {
			t.Errorf("makeSlug(%q) = %q, bad random suffix", title, got)
		}
	}
	if makeSlug("x") == makeSlug("x") {
		t.Error("slugs for the same title should differ")
	}
}
