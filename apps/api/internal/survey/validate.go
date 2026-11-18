package survey

import (
	"fmt"
	"math"
	"strings"
)

const (
	MaxQuestions    = 100
	MaxOptions      = 50
	MaxIDLen        = 64
	MaxTitleLen     = 500
	MaxLabelLen     = 200
	DefaultRatingLo = 1
	DefaultRatingHi = 5
	MaxRatingHi     = 10
)

// Normalize trims text and fills defaults (rating range) before validation,
// so the stored schema is always in a canonical shape.
func (s *Schema) Normalize() {
	if s.Questions == nil {
		s.Questions = []Question{}
	}
	for i := range s.Questions {
		q := &s.Questions[i]
		q.ID = strings.TrimSpace(q.ID)
		q.Title = strings.TrimSpace(q.Title)
		for j := range q.Options {
			q.Options[j].ID = strings.TrimSpace(q.Options[j].ID)
			q.Options[j].Label = strings.TrimSpace(q.Options[j].Label)
		}
		if q.Type == TypeRating {
			if q.Min == nil {
				lo := DefaultRatingLo
				q.Min = &lo
			}
			if q.Max == nil {
				hi := DefaultRatingHi
				q.Max = &hi
			}
		}
	}
}

// Validate checks the schema is well formed. It returns a map of
// field path -> message, e.g. "questions[2].options": "needs at least 2 options".
// An empty map means the schema is valid.
//
// Conditional logic rule: a question's showIf may only reference an EARLIER
// question. That makes cycles impossible and lets visibility be evaluated in
// one top-to-bottom pass.
func (s Schema) Validate() map[string]string {
	errs := map[string]string{}
	if len(s.Questions) > MaxQuestions {
		errs["questions"] = fmt.Sprintf("at most %d questions", MaxQuestions)
		return errs
	}

	// index of each question seen so far, for showIf lookups
	seen := make(map[string]int, len(s.Questions))

	for i, q := range s.Questions {
		p := fmt.Sprintf("questions[%d]", i)

		switch {
		case q.ID == "":
			errs[p+".id"] = "is required"
		case len(q.ID) > MaxIDLen:
			errs[p+".id"] = "is too long"
		default:
			if _, dup := seen[q.ID]; dup {
				errs[p+".id"] = "must be unique"
			}
		}

		if q.Title == "" {
			errs[p+".title"] = "is required"
		} else if len(q.Title) > MaxTitleLen {
			errs[p+".title"] = fmt.Sprintf("must be at most %d characters", MaxTitleLen)
		}

		switch q.Type {
		case TypeSingleChoice, TypeMultiChoice:
			validateOptions(q, p, errs)
		case TypeText, TypeRating:
			if len(q.Options) > 0 {
				errs[p+".options"] = "only choice questions can have options"
			}
		default:
			errs[p+".type"] = "must be one of text, single_choice, multi_choice, rating"
		}

		if q.Type == TypeRating {
			if *q.Min < 0 || *q.Max > MaxRatingHi || *q.Min >= *q.Max {
				errs[p+".max"] = fmt.Sprintf("rating range must satisfy 0 <= min < max <= %d", MaxRatingHi)
			}
		} else if q.Min != nil || q.Max != nil {
			errs[p+".max"] = "only rating questions have min/max"
		}

		if q.ShowIf != nil {
			validateCondition(*q.ShowIf, p+".showIf", s.Questions, seen, errs)
		}

		if q.ID != "" {
			if _, dup := seen[q.ID]; !dup {
				seen[q.ID] = i
			}
		}
	}
	return errs
}

func validateOptions(q Question, p string, errs map[string]string) {
	if len(q.Options) < 2 {
		errs[p+".options"] = "needs at least 2 options"
		return
	}
	if len(q.Options) > MaxOptions {
		errs[p+".options"] = fmt.Sprintf("at most %d options", MaxOptions)
		return
	}
	ids := make(map[string]bool, len(q.Options))
	for j, o := range q.Options {
		op := fmt.Sprintf("%s.options[%d]", p, j)
		if o.ID == "" || len(o.ID) > MaxIDLen {
			errs[op+".id"] = "is required"
		} else if ids[o.ID] {
			errs[op+".id"] = "must be unique"
		}
		ids[o.ID] = true
		if o.Label == "" {
			errs[op+".label"] = "is required"
		} else if len(o.Label) > MaxLabelLen {
			errs[op+".label"] = fmt.Sprintf("must be at most %d characters", MaxLabelLen)
		}
	}
}

// validateCondition checks a showIf against the question it points to.
// `earlier` only contains questions before the current one.
func validateCondition(c Condition, p string, all []Question, earlier map[string]int, errs map[string]string) {
	idx, ok := earlier[c.QuestionID]
	if !ok {
		errs[p+".questionId"] = "must reference an earlier question"
		return
	}
	target := all[idx]

	switch target.Type {
	case TypeSingleChoice, TypeMultiChoice:
		want := OpEquals
		if target.Type == TypeMultiChoice {
			want = OpIncludes
		}
		if c.Operator != want {
			errs[p+".operator"] = fmt.Sprintf("must be %q for a %s question", want, target.Type)
			return
		}
		v, isStr := c.Value.(string)
		if !isStr || !hasOption(target, v) {
			errs[p+".value"] = "must be an option id of the referenced question"
		}

	case TypeRating:
		if c.Operator != OpEquals && c.Operator != OpGTE && c.Operator != OpLTE {
			errs[p+".operator"] = "must be equals, gte or lte for a rating question"
			return
		}
		n, isNum := c.Value.(float64) // encoding/json decodes numbers as float64
		if !isNum || n != math.Trunc(n) || target.Min == nil || target.Max == nil ||
			int(n) < *target.Min || int(n) > *target.Max {
			errs[p+".value"] = "must be a whole number within the rating range"
		}

	default:
		errs[p+".questionId"] = "conditions can only reference choice or rating questions"
	}
}

func hasOption(q Question, id string) bool {
	for _, o := range q.Options {
		if o.ID == id {
			return true
		}
	}
	return false
}
