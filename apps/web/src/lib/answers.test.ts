import { describe, expect, it } from "vitest";
import { pruneAnswers, validateAnswers, visibleIds } from "./answers";
import type { SurveySchema } from "./types";

// Same survey as apps/api/internal/survey/answers_test.go.
const schema: SurveySchema = {
  questions: [
    { id: "q1", type: "single_choice", title: "Use the app?", required: true,
      options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] },
    { id: "q2", type: "rating", title: "Rate it", required: true, min: 1, max: 5,
      showIf: { questionId: "q1", operator: "equals", value: "yes" } },
    { id: "q3", type: "multi_choice", title: "Features", required: false,
      options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    { id: "q4", type: "text", title: "Why so low?", required: true,
      showIf: { questionId: "q2", operator: "lte", value: 2 } },
    { id: "q5", type: "text", title: "About B", required: false,
      showIf: { questionId: "q3", operator: "includes", value: "b" } },
  ],
};

const ids = (s: Set<string>) => [...s].sort();

describe("visibleIds", () => {
  it("shows unconditional questions only, initially", () => {
    expect(ids(visibleIds(schema, {}))).toEqual(["q1", "q3"]);
  });

  it("reveals follow-ups as answers change", () => {
    expect(ids(visibleIds(schema, { q1: "yes" }))).toEqual(["q1", "q2", "q3"]);
    expect(ids(visibleIds(schema, { q1: "yes", q2: 2 }))).toEqual(["q1", "q2", "q3", "q4"]);
    expect(ids(visibleIds(schema, { q1: "yes", q2: 4 }))).toEqual(["q1", "q2", "q3"]);
    expect(ids(visibleIds(schema, { q3: ["a", "b"] }))).toEqual(["q1", "q3", "q5"]);
  });

  it("hides chained questions when an earlier answer changes", () => {
    // q2 still has a stale answer of 1, but q1 = no hides q2, so q4 too.
    expect(ids(visibleIds(schema, { q1: "no", q2: 1 }))).toEqual(["q1", "q3"]);
  });
});

describe("validateAnswers", () => {
  it("requires visible required questions only", () => {
    expect(validateAnswers(schema, {})).toEqual({ q1: "This question is required" });
    expect(validateAnswers(schema, { q1: "no" })).toEqual({});
    expect(Object.keys(validateAnswers(schema, { q1: "yes" }))).toEqual(["q2"]);
    expect(Object.keys(validateAnswers(schema, { q1: "yes", q2: 1 }))).toEqual(["q4"]);
  });

  it("treats whitespace as empty", () => {
    expect(validateAnswers(schema, { q1: "yes", q2: 1, q4: "   " })).toHaveProperty("q4");
  });

  it("rejects out-of-range ratings", () => {
    expect(validateAnswers(schema, { q1: "yes", q2: 9 })).toHaveProperty("q2");
  });
});

describe("pruneAnswers", () => {
  it("drops hidden and empty answers, trims text", () => {
    expect(pruneAnswers(schema, { q1: "no", q2: 1, q3: [], q4: "stale", q5: "x" })).toEqual({ q1: "no" });
    expect(pruneAnswers(schema, { q1: "yes", q2: 2, q4: "  slow  " })).toEqual({ q1: "yes", q2: 2, q4: "slow" });
  });
});
