import { describe, expect, it } from "vitest";
import {
  changeType,
  defaultCondition,
  duplicateQuestion,
  errorsByQuestion,
  newQuestion,
  removeQuestion,
  validateSchema,
} from "./schema";
import type { Question, SurveySchema } from "./types";

// Same fixture as the Go test (validate_test.go) so both validators agree.
const valid: SurveySchema = {
  questions: [
    { id: "q1", type: "single_choice", title: "Use the app?", required: true,
      options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] },
    { id: "q2", type: "rating", title: "Rate it", required: true, min: 1, max: 5,
      showIf: { questionId: "q1", operator: "equals", value: "yes" } },
    { id: "q3", type: "multi_choice", title: "Features used", required: false,
      options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    { id: "q4", type: "text", title: "Why?", required: false,
      showIf: { questionId: "q2", operator: "lte", value: 2 } },
    { id: "q5", type: "text", title: "Tell us about B", required: false,
      showIf: { questionId: "q3", operator: "includes", value: "b" } },
  ],
};

const clone = (): Question[] => structuredClone(valid.questions);

describe("validateSchema", () => {
  it("accepts a valid schema", () => {
    expect(validateSchema(valid)).toEqual({});
  });

  it("accepts an empty draft", () => {
    expect(validateSchema({ questions: [] })).toEqual({});
  });

  const cases: [string, (qs: Question[]) => void, string][] = [
    ["blank title", (qs) => (qs[0].title = "  "), "questions[0].title"],
    ["duplicate id", (qs) => (qs[1].id = "q1"), "questions[1].id"],
    ["one option", (qs) => (qs[0].options = [{ id: "yes", label: "Yes" }]), "questions[0].options"],
    ["empty option label", (qs) => (qs[2].options![1].label = ""), "questions[2].options[1].label"],
    ["bad rating range", (qs) => (qs[1].min = 5), "questions[1].max"],
    ["condition on later question", (qs) => (qs[1].showIf!.questionId = "q3"), "questions[1].showIf.questionId"],
    ["condition on deleted option", (qs) => (qs[1].showIf!.value = "maybe"), "questions[1].showIf.value"],
    ["wrong operator for multi", (qs) => (qs[4].showIf!.operator = "equals"), "questions[4].showIf.operator"],
    ["rating value out of range", (qs) => (qs[3].showIf!.value = 9), "questions[3].showIf.value"],
    ["rating value not whole", (qs) => (qs[3].showIf!.value = 2.5), "questions[3].showIf.value"],
    ["condition on text question", (qs) => (qs[4].showIf = { questionId: "q4", operator: "equals", value: "x" }),
      "questions[4].showIf.questionId"],
  ];

  it.each(cases)("rejects %s", (_name, mutate, key) => {
    const qs = clone();
    mutate(qs);
    expect(validateSchema({ questions: qs })).toHaveProperty([key]);
  });

  it("flags a condition after reordering puts the target below", () => {
    const qs = clone();
    const [q1, q2, ...rest] = qs;
    expect(validateSchema({ questions: [q2, q1, ...rest] })).toHaveProperty(["questions[0].showIf.questionId"]);
  });
});

describe("builder helpers", () => {
  it("newQuestion gives choice questions two options and ratings 1-5", () => {
    expect(newQuestion("single_choice").options).toHaveLength(2);
    expect(newQuestion("rating")).toMatchObject({ min: 1, max: 5 });
    expect(newQuestion("text").options).toBeUndefined();
  });

  it("changeType keeps options between choice types and drops them otherwise", () => {
    const q = valid.questions[0];
    expect(changeType(q, "multi_choice").options).toEqual(q.options);
    const asText = changeType(q, "text");
    expect(asText.options).toBeUndefined();
    expect(asText.title).toBe(q.title);
    expect(changeType(q, "rating")).toMatchObject({ min: 1, max: 5 });
  });

  it("removeQuestion clears conditions that pointed at it", () => {
    const qs = removeQuestion(clone(), "q1");
    expect(qs.map((q) => q.id)).toEqual(["q2", "q3", "q4", "q5"]);
    expect(qs[0].showIf).toBeUndefined();
    expect(qs[2].showIf).toBeDefined(); // q4 depends on q2, untouched
  });

  it("duplicateQuestion gets fresh ids", () => {
    const d = duplicateQuestion(valid.questions[0]);
    expect(d.id).not.toBe("q1");
    expect(d.options!.map((o) => o.id)).not.toContain("yes");
    expect(d.options!.map((o) => o.label)).toEqual(["Yes", "No"]);
  });

  it("defaultCondition picks the right operator per type", () => {
    expect(defaultCondition(valid.questions[0])).toMatchObject({ operator: "equals", value: "yes" });
    expect(defaultCondition(valid.questions[2])).toMatchObject({ operator: "includes", value: "a" });
    expect(defaultCondition(valid.questions[1])).toMatchObject({ operator: "gte", value: 5 });
  });

  it("errorsByQuestion groups client and server keys", () => {
    const { byQuestion, other } = errorsByQuestion({
      "questions[1].title": "is required",
      "draftSchema.questions[1].options[0].label": "is required",
      title: "is required",
    });
    expect(byQuestion[1]).toEqual({ title: "is required", "options[0].label": "is required" });
    expect(other).toEqual({ title: "is required" });
  });
});
