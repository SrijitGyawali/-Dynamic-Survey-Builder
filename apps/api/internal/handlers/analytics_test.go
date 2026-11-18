package handlers

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/srijitgyawali/survey-builder/api/internal/store"
	"github.com/srijitgyawali/survey-builder/api/internal/survey"
)

func TestBuildQuestionStats(t *testing.T) {
	var schema survey.Schema
	_ = json.Unmarshal([]byte(`{"questions":[
	  {"id":"q1","type":"single_choice","title":"Use it?","required":true,
	   "options":[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]},
	  {"id":"q2","type":"rating","title":"Rate","min":1,"max":5,
	   "showIf":{"questionId":"q1","operator":"equals","value":"y"}},
	  {"id":"q3","type":"text","title":"Why?"}
	]}`), &schema)
	schema.Normalize()

	now := time.Now()
	stats := buildQuestionStats(schema,
		map[string]int{"q1": 10, "q2": 6, "q3": 2},
		map[string]map[string]int{"q1": {"y": 6, "n": 3, "old": 1}}, // "old" was removed in a later version
		map[string]map[int]int{"q2": {5: 3, 4: 2, 1: 1}},
		map[string][]store.TextAnswer{"q3": {{ResponseID: "r1", Answer: "great", SubmittedAt: now}}},
	)

	if len(stats) != 3 || stats[0].ID != "q1" || stats[2].ID != "q3" {
		t.Fatalf("questions should follow schema order: %+v", stats)
	}

	q1 := stats[0]
	if q1.Answered != 10 || len(q1.Options) != 3 {
		t.Fatalf("q1 = %+v", q1)
	}
	if q1.Options[0].Count != 6 || q1.Options[1].Count != 3 {
		t.Fatalf("option counts wrong: %+v", q1.Options)
	}
	if q1.Options[2].ID != RemovedOptionsID || q1.Options[2].Count != 1 {
		t.Fatalf("votes for removed options should be grouped: %+v", q1.Options)
	}

	q2 := stats[1]
	if !q2.Conditional || q2.Rating == nil || q2.Rating.Average == nil {
		t.Fatalf("q2 = %+v", q2)
	}
	// (5*3 + 4*2 + 1*1) / 6 = 24/6 = 4.0
	if *q2.Rating.Average != 4.0 {
		t.Fatalf("average = %v, want 4", *q2.Rating.Average)
	}
	if len(q2.Rating.Distribution) != 5 || q2.Rating.Distribution[1].Count != 0 {
		t.Fatalf("distribution should list every value incl. zeros: %+v", q2.Rating.Distribution)
	}

	if stats[2].Text == nil || stats[2].Text.Latest[0].Answer != "great" {
		t.Fatalf("q3 = %+v", stats[2])
	}
}

func TestRatingWithNoAnswersHasNullAverage(t *testing.T) {
	schema := survey.Schema{Questions: []survey.Question{{ID: "r", Type: survey.TypeRating, Title: "R"}}}
	schema.Normalize()
	stats := buildQuestionStats(schema, nil, nil, nil, nil)
	if stats[0].Rating.Average != nil {
		t.Fatal("average must be null, not 0, when nobody rated")
	}
}

func TestCursorRoundTrip(t *testing.T) {
	in := store.TextAnswerCursor{SubmittedAt: time.Date(2026, 11, 1, 10, 0, 0, 123, time.UTC), ResponseID: "5fb5ea65-1db7-424d-9c53-dd9374f022bc"}
	out, err := decodeCursor(encodeCursor(in))
	if err != nil || !out.SubmittedAt.Equal(in.SubmittedAt) || out.ResponseID != in.ResponseID {
		t.Fatalf("round trip failed: %+v %v", out, err)
	}
	for _, bad := range []string{"%%%", "e30", "eyJ0IjoiMjAyNiIsImlkIjoibm9wZSJ9"} {
		if _, err := decodeCursor(bad); err == nil {
			t.Errorf("cursor %q should be rejected", bad)
		}
	}
}
