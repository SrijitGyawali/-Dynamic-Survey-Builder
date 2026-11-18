// Respondent-side rules: which questions are visible, and whether answers are
// valid. Mirrors apps/api/internal/survey/answers.go. The API re-checks
// everything; this copy exists so the form can react instantly.

import type { Answers, Condition, Question, SurveySchema } from "./types";

export const MAX_TEXT_ANSWER = 5000;

type Answer = Answers[string] | undefined;

/** Treats "", whitespace, [] and undefined as "not answered". */
export function isEmpty(a: Answer): boolean {
  if (a === undefined || a === null) return true;
  if (typeof a === "string") return a.trim() === "";
  if (Array.isArray(a)) return a.length === 0;
  return false;
}

function conditionMet(c: Condition, a: Answer): boolean {
  if (isEmpty(a)) return false;
  if (Array.isArray(a)) return c.operator === "includes" && a.includes(String(c.value));
  if (typeof a === "number") {
    const v = Number(c.value);
    if (c.operator === "gte") return a >= v;
    if (c.operator === "lte") return a <= v;
    return c.operator === "equals" && a === v;
  }
  return c.operator === "equals" && a === c.value;
}

/**
 * Visible question IDs, in one top-to-bottom pass. A question is hidden if its
 * condition isn't met OR the question it depends on is itself hidden.
 */
export function visibleIds(schema: SurveySchema, answers: Answers): Set<string> {
  const vis = new Set<string>();
  for (const q of schema.questions) {
    if (!q.showIf || (vis.has(q.showIf.questionId) && conditionMet(q.showIf, answers[q.showIf.questionId]))) {
      vis.add(q.id);
    }
  }
  return vis;
}

/** Only the answers that would be sent: visible and non-empty, text trimmed. */
export function pruneAnswers(schema: SurveySchema, answers: Answers): Answers {
  const vis = visibleIds(schema, answers);
  const out: Answers = {};
  for (const q of schema.questions) {
    const a = answers[q.id];
    if (!vis.has(q.id) || isEmpty(a)) continue;
    out[q.id] = typeof a === "string" ? a.trim() : a;
  }
  return out;
}

function answerError(q: Question, a: Answer): string | null {
  if (isEmpty(a)) return q.required ? "This question is required" : null;
  switch (q.type) {
    case "text":
      return typeof a === "string" && a.trim().length > MAX_TEXT_ANSWER
        ? `Please keep it under ${MAX_TEXT_ANSWER} characters`
        : null;
    case "single_choice":
      return typeof a === "string" && q.options?.some((o) => o.id === a) ? null : "Please choose an option";
    case "multi_choice":
      return Array.isArray(a) && a.every((x) => q.options?.some((o) => o.id === x)) ? null : "Invalid selection";
    case "rating": {
      const lo = q.min ?? 1;
      const hi = q.max ?? 5;
      return typeof a === "number" && Number.isInteger(a) && a >= lo && a <= hi
        ? null
        : `Please pick a value from ${lo} to ${hi}`;
    }
  }
}

/** Errors keyed by question ID, for visible questions only. */
export function validateAnswers(schema: SurveySchema, answers: Answers): Record<string, string> {
  const vis = visibleIds(schema, answers);
  const errs: Record<string, string> = {};
  for (const q of schema.questions) {
    if (!vis.has(q.id)) continue;
    const e = answerError(q, answers[q.id]);
    if (e) errs[q.id] = e;
  }
  return errs;
}
