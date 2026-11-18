package survey

import (
	"encoding/json"
	"reflect"
	"testing"
)

// Survey used below:
//
//	q1 single  "Use the app?"     yes/no      required
//	q2 rating  "Rate it" 1..5     required    showIf q1 == yes
//	q3 multi   "Features"         a/b         optional
//	q4 text    "Why so low?"      required    showIf q2 <= 2   (chained: needs q1=yes too)
//	q5 text    "About B"          optional    showIf q3 includes b
func answersSchema(t *testing.T) Schema {
	return parse(t, `{"questions":[
	  {"id":"q1","type":"single_choice","title":"Use the app?","required":true,
	   "options":[{"id":"yes","label":"Yes"},{"id":"no","label":"No"}]},
	  {"id":"q2","type":"rating","title":"Rate it","required":true,
	   "showIf":{"questionId":"q1","operator":"equals","value":"yes"}},
	  {"id":"q3","type":"multi_choice","title":"Features","required":false,
	   "options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]},
	  {"id":"q4","type":"text","title":"Why so low?","required":true,
	   "showIf":{"questionId":"q2","operator":"lte","value":2}},
	  {"id":"q5","type":"text","title":"About B","required":false,
	   "showIf":{"questionId":"q3","operator":"includes","value":"b"}}
	]}`)
}

func raw(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestValidateAnswersHappyPaths(t *testing.T) {
	s := answersSchema(t)
	cases := []struct {
		name, in string
		want     Answers
	}{
		{"no branch", `{"q1":"no"}`, Answers{"q1": "no"}},
		{"yes, high rating", `{"q1":"yes","q2":5}`, Answers{"q1": "yes", "q2": 5}},
		{"yes, low rating needs why", `{"q1":"yes","q2":1,"q4":"  too slow  "}`,
			Answers{"q1": "yes", "q2": 1, "q4": "too slow"}},
		{"multi with follow-up", `{"q1":"no","q3":["b","a"],"q5":"love it"}`,
			Answers{"q1": "no", "q3": []string{"b", "a"}, "q5": "love it"}},
		{"empty optional values are dropped", `{"q1":"no","q3":[],"q5":""}`, Answers{"q1": "no"}},
		{"answers to hidden questions are dropped", `{"q1":"no","q2":1,"q4":"stale","q5":"stale"}`,
			Answers{"q1": "no"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clean, errs := ValidateAnswers(s, raw(t, tc.in), false)
			if len(errs) != 0 {
				t.Fatalf("unexpected errors: %v", errs)
			}
			if !reflect.DeepEqual(clean, tc.want) {
				t.Fatalf("clean = %#v, want %#v", clean, tc.want)
			}
		})
	}
}

func TestValidateAnswersErrors(t *testing.T) {
	s := answersSchema(t)
	cases := []struct {
		name, in, wantQ string
	}{
		{"missing required", `{}`, "q1"},
		{"visible required follow-up missing", `{"q1":"yes"}`, "q2"},
		{"chained required follow-up missing", `{"q1":"yes","q2":2}`, "q4"},
		{"whitespace text counts as empty", `{"q1":"yes","q2":2,"q4":"   "}`, "q4"},
		{"unknown question", `{"q1":"no","hack":"x"}`, "hack"},
		{"single: invalid option", `{"q1":"maybe"}`, "q1"},
		{"single: wrong type", `{"q1":["yes"]}`, "q1"},
		{"multi: not a list", `{"q1":"no","q3":"a"}`, "q3"},
		{"multi: invalid option", `{"q1":"no","q3":["a","z"]}`, "q3"},
		{"multi: duplicate", `{"q1":"no","q3":["a","a"]}`, "q3"},
		{"rating: out of range", `{"q1":"yes","q2":6}`, "q2"},
		{"rating: fractional", `{"q1":"yes","q2":3.5}`, "q2"},
		{"rating: string", `{"q1":"yes","q2":"3"}`, "q2"},
		{"text: wrong type", `{"q1":"yes","q2":1,"q4":42}`, "q4"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, errs := ValidateAnswers(s, raw(t, tc.in), false)
			if _, ok := errs[tc.wantQ]; !ok {
				t.Fatalf("expected error for %s, got %v", tc.wantQ, errs)
			}
		})
	}
}

func TestHiddenRequiredIsNotEnforced(t *testing.T) {
	// q2 and q4 are required, but hidden when q1 = no.
	_, errs := ValidateAnswers(answersSchema(t), raw(t, `{"q1":"no"}`), false)
	if len(errs) != 0 {
		t.Fatalf("hidden required questions must not error: %v", errs)
	}
}

func TestInvalidTargetAnswerHidesDependents(t *testing.T) {
	// q2 is invalid (6), so it doesn't count as answered: q4 stays hidden.
	_, errs := ValidateAnswers(answersSchema(t), raw(t, `{"q1":"yes","q2":6}`), false)
	if _, ok := errs["q4"]; ok {
		t.Fatalf("q4 should be hidden while q2 is invalid: %v", errs)
	}
}

func TestPartialSkipsRequired(t *testing.T) {
	clean, errs := ValidateAnswers(answersSchema(t), raw(t, `{"q1":"yes"}`), true)
	if len(errs) != 0 {
		t.Fatalf("partial save should not require answers: %v", errs)
	}
	if clean["q1"] != "yes" {
		t.Fatalf("clean = %v", clean)
	}
	// ...but type errors still apply.
	if _, errs := ValidateAnswers(answersSchema(t), raw(t, `{"q1":"maybe"}`), true); errs["q1"] == "" {
		t.Fatal("partial save must still validate types")
	}
}

func TestVisible(t *testing.T) {
	s := answersSchema(t)
	vis := Visible(s, Answers{"q1": "yes", "q2": 2, "q3": []string{"a"}})
	want := map[string]bool{"q1": true, "q2": true, "q3": true, "q4": true, "q5": false}
	if !reflect.DeepEqual(vis, want) {
		t.Fatalf("got %v want %v", vis, want)
	}
	// Chain: q1 = no hides q2, and therefore q4, even with a stale q2 answer.
	vis = Visible(s, Answers{"q1": "no", "q2": 1})
	if vis["q2"] || vis["q4"] {
		t.Fatalf("chained questions should be hidden: %v", vis)
	}
}
