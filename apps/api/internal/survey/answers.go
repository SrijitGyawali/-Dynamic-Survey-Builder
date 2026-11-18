package survey

import (
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

const MaxTextAnswer = 5000 // characters

// Visible reports which questions are shown for a set of (clean) answers.
//
// Because a showIf may only reference an EARLIER question (enforced by
// Schema.Validate), one top-to-bottom pass is enough: by the time we reach a
// question, the visibility of everything it can depend on is already known.
//
// A question whose target is hidden is hidden too ("chained" conditions),
// even if a stale answer for the target was sent.
func Visible(s Schema, clean Answers) map[string]bool {
	vis := make(map[string]bool, len(s.Questions))
	for _, q := range s.Questions {
		if q.ShowIf == nil {
			vis[q.ID] = true
			continue
		}
		c := *q.ShowIf
		vis[q.ID] = vis[c.QuestionID] && conditionMet(c, clean[c.QuestionID])
	}
	return vis
}

// conditionMet evaluates a condition against a CLEAN answer value
// (string, []string or int; nil when unanswered).
func conditionMet(c Condition, answer any) bool {
	switch a := answer.(type) {
	case string: // single choice
		v, ok := c.Value.(string)
		return ok && c.Operator == OpEquals && a == v
	case []string: // multi choice
		v, ok := c.Value.(string)
		if !ok || c.Operator != OpIncludes {
			return false
		}
		for _, x := range a {
			if x == v {
				return true
			}
		}
		return false
	case int: // rating
		v, ok := toFloat(c.Value)
		if !ok {
			return false
		}
		n := float64(a)
		switch c.Operator {
		case OpEquals:
			return n == v
		case OpGTE:
			return n >= v
		case OpLTE:
			return n <= v
		}
	}
	return false // unanswered never satisfies a condition
}

// ValidateAnswers checks raw, JSON-decoded answers against a (valid) schema.
//
// It returns the clean answers to store (hidden and empty answers removed,
// values in canonical types) and errors keyed by question ID.
//
// partial=true skips the "required" check (for saving progress).
//
// Rules:
//   - unknown question IDs are rejected
//   - answers to HIDDEN questions are dropped, and required doesn't apply to them
//   - visible + required + empty -> "this question is required"
//   - types: text = string (<= 5000 chars), single = one valid option id,
//     multi = list of unique valid option ids, rating = whole number in range
func ValidateAnswers(s Schema, raw map[string]any, partial bool) (Answers, map[string]string) {
	errs := map[string]string{}
	clean := Answers{}

	known := make(map[string]bool, len(s.Questions))
	for _, q := range s.Questions {
		known[q.ID] = true
	}
	for id := range raw {
		if !known[id] {
			errs[id] = "unknown question"
		}
	}

	vis := make(map[string]bool, len(s.Questions))
	for _, q := range s.Questions {
		// Visibility uses only clean answers of earlier questions.
		if q.ShowIf == nil {
			vis[q.ID] = true
		} else {
			c := *q.ShowIf
			vis[q.ID] = vis[c.QuestionID] && conditionMet(c, clean[c.QuestionID])
		}
		if !vis[q.ID] {
			continue // hidden: ignore whatever was sent
		}

		value, empty, err := cleanAnswer(q, raw[q.ID])
		switch {
		case err != "":
			errs[q.ID] = err
		case empty:
			if q.Required && !partial {
				errs[q.ID] = "this question is required"
			}
		default:
			clean[q.ID] = value
		}
	}
	return clean, errs
}

// cleanAnswer converts one raw answer to its canonical type.
// Returns (value, isEmpty, errorMessage).
func cleanAnswer(q Question, raw any) (any, bool, string) {
	if raw == nil {
		return nil, true, ""
	}
	switch q.Type {
	case TypeText:
		s, ok := raw.(string)
		if !ok {
			return nil, false, "must be text"
		}
		s = strings.TrimSpace(s)
		if s == "" {
			return nil, true, ""
		}
		if utf8.RuneCountInString(s) > MaxTextAnswer {
			return nil, false, fmt.Sprintf("must be at most %d characters", MaxTextAnswer)
		}
		return s, false, ""

	case TypeSingleChoice:
		s, ok := raw.(string)
		if !ok {
			return nil, false, "must be one option"
		}
		if s == "" {
			return nil, true, ""
		}
		if !hasOption(q, s) {
			return nil, false, "is not a valid option"
		}
		return s, false, ""

	case TypeMultiChoice:
		list, ok := raw.([]any)
		if !ok {
			return nil, false, "must be a list of options"
		}
		if len(list) == 0 {
			return nil, true, ""
		}
		seen := make(map[string]bool, len(list))
		out := make([]string, 0, len(list))
		for _, item := range list {
			s, ok := item.(string)
			if !ok || !hasOption(q, s) {
				return nil, false, "contains an invalid option"
			}
			if seen[s] {
				return nil, false, "contains a duplicate option"
			}
			seen[s] = true
			out = append(out, s)
		}
		return out, false, ""

	case TypeRating:
		n, ok := raw.(float64) // encoding/json numbers are float64
		if !ok || n != math.Trunc(n) {
			return nil, false, "must be a whole number"
		}
		lo, hi := DefaultRatingLo, DefaultRatingHi
		if q.Min != nil {
			lo = *q.Min
		}
		if q.Max != nil {
			hi = *q.Max
		}
		if int(n) < lo || int(n) > hi {
			return nil, false, fmt.Sprintf("must be between %d and %d", lo, hi)
		}
		return int(n), false, ""
	}
	return nil, false, "unsupported question type"
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	}
	return 0, false
}
