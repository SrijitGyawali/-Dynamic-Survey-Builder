// Package survey holds the survey schema types and (later) the
// visibility and validation rules applied to responses.
//
// Mirrors apps/web/src/lib/types.ts. Keep both in sync.
package survey

type QuestionType string

const (
	TypeText         QuestionType = "text"
	TypeSingleChoice QuestionType = "single_choice"
	TypeMultiChoice  QuestionType = "multi_choice"
	TypeRating       QuestionType = "rating"
)

type Option struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type ConditionOperator string

const (
	OpEquals   ConditionOperator = "equals"   // single_choice
	OpIncludes ConditionOperator = "includes" // multi_choice
	OpGTE      ConditionOperator = "gte"      // rating
	OpLTE      ConditionOperator = "lte"      // rating
)

// Condition shows a question only when an earlier question's answer matches.
type Condition struct {
	QuestionID string            `json:"questionId"`
	Operator   ConditionOperator `json:"operator"`
	Value      any               `json:"value"`
}

type Question struct {
	ID       string       `json:"id"`
	Type     QuestionType `json:"type"`
	Title    string       `json:"title"`
	Required bool         `json:"required"`
	Options  []Option     `json:"options,omitempty"`
	Min      *int         `json:"min,omitempty"`
	Max      *int         `json:"max,omitempty"`
	ShowIf   *Condition   `json:"showIf,omitempty"`
}

type Schema struct {
	Questions []Question `json:"questions"`
}

// Answers maps question ID to the raw JSON-decoded answer value.
type Answers map[string]any
