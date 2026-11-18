package survey

import (
	"encoding/json"
	"testing"
)

// parse decodes JSON the same way the HTTP handler does, so condition
// values arrive as string / float64 exactly like in production.
func parse(t *testing.T, raw string) Schema {
	t.Helper()
	var s Schema
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatalf("bad test JSON: %v", err)
	}
	s.Normalize()
	return s
}

const validSchema = `{"questions":[
  {"id":"q1","type":"single_choice","title":"Use the app?","required":true,
   "options":[{"id":"yes","label":"Yes"},{"id":"no","label":"No"}]},
  {"id":"q2","type":"rating","title":"Rate it","required":true,
   "showIf":{"questionId":"q1","operator":"equals","value":"yes"}},
  {"id":"q3","type":"multi_choice","title":"Features used","required":false,
   "options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]},
  {"id":"q4","type":"text","title":"Why?","required":false,
   "showIf":{"questionId":"q2","operator":"lte","value":2}},
  {"id":"q5","type":"text","title":"Tell us about B",
   "showIf":{"questionId":"q3","operator":"includes","value":"b"}}
]}`

func TestValidSchema(t *testing.T) {
	s := parse(t, validSchema)
	if errs := s.Validate(); len(errs) != 0 {
		t.Fatalf("expected valid, got %v", errs)
	}
	if *s.Questions[1].Min != 1 || *s.Questions[1].Max != 5 {
		t.Fatal("rating defaults should be filled to 1..5")
	}
}

func TestEmptySchemaIsValid(t *testing.T) {
	// A draft may have no questions; publishing checks for at least one.
	s := parse(t, `{}`)
	if errs := s.Validate(); len(errs) != 0 {
		t.Fatalf("got %v", errs)
	}
}

func TestInvalidSchemas(t *testing.T) {
	cases := []struct {
		name, raw, wantKey string
	}{
		{"missing id",
			`{"questions":[{"id":"","type":"text","title":"T"}]}`,
			"questions[0].id"},
		{"duplicate id",
			`{"questions":[{"id":"q","type":"text","title":"A"},{"id":"q","type":"text","title":"B"}]}`,
			"questions[1].id"},
		{"blank title",
			`{"questions":[{"id":"q","type":"text","title":"   "}]}`,
			"questions[0].title"},
		{"unknown type",
			`{"questions":[{"id":"q","type":"date","title":"T"}]}`,
			"questions[0].type"},
		{"choice with one option",
			`{"questions":[{"id":"q","type":"single_choice","title":"T","options":[{"id":"a","label":"A"}]}]}`,
			"questions[0].options"},
		{"duplicate option id",
			`{"questions":[{"id":"q","type":"multi_choice","title":"T","options":[{"id":"a","label":"A"},{"id":"a","label":"B"}]}]}`,
			"questions[0].options[1].id"},
		{"empty option label",
			`{"questions":[{"id":"q","type":"single_choice","title":"T","options":[{"id":"a","label":"A"},{"id":"b","label":""}]}]}`,
			"questions[0].options[1].label"},
		{"text with options",
			`{"questions":[{"id":"q","type":"text","title":"T","options":[{"id":"a","label":"A"}]}]}`,
			"questions[0].options"},
		{"rating min >= max",
			`{"questions":[{"id":"q","type":"rating","title":"T","min":5,"max":5}]}`,
			"questions[0].max"},
		{"rating max too large",
			`{"questions":[{"id":"q","type":"rating","title":"T","min":1,"max":11}]}`,
			"questions[0].max"},
		{"min/max on text",
			`{"questions":[{"id":"q","type":"text","title":"T","max":3}]}`,
			"questions[0].max"},
		{"condition on later question",
			`{"questions":[
			  {"id":"q1","type":"text","title":"A","showIf":{"questionId":"q2","operator":"equals","value":"x"}},
			  {"id":"q2","type":"single_choice","title":"B","options":[{"id":"x","label":"X"},{"id":"y","label":"Y"}]}]}`,
			"questions[0].showIf.questionId"},
		{"condition on itself",
			`{"questions":[{"id":"q1","type":"single_choice","title":"A","options":[{"id":"x","label":"X"},{"id":"y","label":"Y"}],
			  "showIf":{"questionId":"q1","operator":"equals","value":"x"}}]}`,
			"questions[0].showIf.questionId"},
		{"condition on unknown question",
			`{"questions":[{"id":"q1","type":"text","title":"A","showIf":{"questionId":"nope","operator":"equals","value":"x"}}]}`,
			"questions[0].showIf.questionId"},
		{"condition on text question",
			`{"questions":[{"id":"q1","type":"text","title":"A"},
			  {"id":"q2","type":"text","title":"B","showIf":{"questionId":"q1","operator":"equals","value":"hi"}}]}`,
			"questions[1].showIf.questionId"},
		{"wrong operator for single choice",
			`{"questions":[{"id":"q1","type":"single_choice","title":"A","options":[{"id":"x","label":"X"},{"id":"y","label":"Y"}]},
			  {"id":"q2","type":"text","title":"B","showIf":{"questionId":"q1","operator":"includes","value":"x"}}]}`,
			"questions[1].showIf.operator"},
		{"wrong operator for multi choice",
			`{"questions":[{"id":"q1","type":"multi_choice","title":"A","options":[{"id":"x","label":"X"},{"id":"y","label":"Y"}]},
			  {"id":"q2","type":"text","title":"B","showIf":{"questionId":"q1","operator":"equals","value":"x"}}]}`,
			"questions[1].showIf.operator"},
		{"condition value not an option",
			`{"questions":[{"id":"q1","type":"single_choice","title":"A","options":[{"id":"x","label":"X"},{"id":"y","label":"Y"}]},
			  {"id":"q2","type":"text","title":"B","showIf":{"questionId":"q1","operator":"equals","value":"z"}}]}`,
			"questions[1].showIf.value"},
		{"rating condition out of range",
			`{"questions":[{"id":"q1","type":"rating","title":"A"},
			  {"id":"q2","type":"text","title":"B","showIf":{"questionId":"q1","operator":"gte","value":9}}]}`,
			"questions[1].showIf.value"},
		{"rating condition not a whole number",
			`{"questions":[{"id":"q1","type":"rating","title":"A"},
			  {"id":"q2","type":"text","title":"B","showIf":{"questionId":"q1","operator":"gte","value":2.5}}]}`,
			"questions[1].showIf.value"},
		{"rating condition as string",
			`{"questions":[{"id":"q1","type":"rating","title":"A"},
			  {"id":"q2","type":"text","title":"B","showIf":{"questionId":"q1","operator":"gte","value":"3"}}]}`,
			"questions[1].showIf.value"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := parse(t, tc.raw).Validate()
			if _, ok := errs[tc.wantKey]; !ok {
				t.Fatalf("expected error at %q, got %v", tc.wantKey, errs)
			}
		})
	}
}

func TestTooManyQuestions(t *testing.T) {
	s := Schema{Questions: make([]Question, MaxQuestions+1)}
	if _, ok := s.Validate()["questions"]; !ok {
		t.Fatal("expected a limit error")
	}
}
