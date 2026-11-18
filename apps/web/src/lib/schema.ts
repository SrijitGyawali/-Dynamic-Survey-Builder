// Builder helpers: creating and transforming questions, plus a client-side
// copy of the API's schema validation (apps/api/internal/survey/validate.go)
// so admins get instant feedback. The API stays the source of truth.

import type { Condition, Option, Question, QuestionType, SurveySchema } from "./types";

export const LIMITS = {
  questions: 100,
  options: 50,
  title: 500,
  label: 200,
  ratingMax: 10,
};

export const TYPE_LABELS: Record<QuestionType, string> = {
  text: "Text",
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  rating: "Rating",
};

const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);
export const newQuestionId = () => `q_${shortId()}`;
export const newOptionId = () => `o_${shortId()}`;

const isChoice = (t: QuestionType) => t === "single_choice" || t === "multi_choice";

export function newQuestion(type: QuestionType): Question {
  const q: Question = { id: newQuestionId(), type, title: "", required: false };
  if (isChoice(type)) {
    q.options = [
      { id: newOptionId(), label: "Option 1" },
      { id: newOptionId(), label: "Option 2" },
    ];
  }
  if (type === "rating") {
    q.min = 1;
    q.max = 5;
  }
  return q;
}

/** Change a question's type, keeping whatever still makes sense. */
export function changeType(q: Question, type: QuestionType): Question {
  const next: Question = { id: q.id, title: q.title, required: q.required, type, showIf: q.showIf };
  if (isChoice(type)) {
    next.options = q.options?.length ? q.options : newQuestion(type).options;
  }
  if (type === "rating") {
    next.min = 1;
    next.max = 5;
  }
  if (!next.showIf) delete next.showIf;
  return next;
}

export function duplicateQuestion(q: Question): Question {
  return {
    ...structuredClone(q),
    id: newQuestionId(),
    title: q.title ? `${q.title} (copy)` : "",
    options: q.options?.map((o) => ({ ...o, id: newOptionId() })),
    // A copy keeps its condition; it still points at an earlier question.
  };
}

/** Questions that depend on `id` through showIf. */
export function dependentsOf(questions: Question[], id: string): Question[] {
  return questions.filter((q) => q.showIf?.questionId === id);
}

/** Remove a question and clear any conditions that pointed at it. */
export function removeQuestion(questions: Question[], id: string): Question[] {
  return questions
    .filter((q) => q.id !== id)
    .map((q) => {
      if (q.showIf?.questionId !== id) return q;
      const copy = { ...q };
      delete copy.showIf;
      return copy;
    });
}

/** Questions a given question may depend on: earlier, and choice or rating. */
export function conditionTargets(questions: Question[], index: number): Question[] {
  return questions.slice(0, index).filter((q) => q.type !== "text");
}

/** A sensible default condition for a target question. */
export function defaultCondition(target: Question): Condition {
  switch (target.type) {
    case "multi_choice":
      return { questionId: target.id, operator: "includes", value: target.options?.[0]?.id ?? "" };
    case "rating":
      return { questionId: target.id, operator: "gte", value: target.max ?? 5 };
    default:
      return { questionId: target.id, operator: "equals", value: target.options?.[0]?.id ?? "" };
  }
}

export function optionLabel(q: Question | undefined, id: string | number): string {
  return q?.options?.find((o: Option) => o.id === id)?.label ?? String(id);
}

// ---------------------------------------------------------------------------
// Validation: mirrors validate.go. Returns { "questions[i].field": message }.
// ---------------------------------------------------------------------------

export function validateSchema(schema: SurveySchema): Record<string, string> {
  const errs: Record<string, string> = {};
  const qs = schema.questions;
  if (qs.length > LIMITS.questions) {
    errs["questions"] = `at most ${LIMITS.questions} questions`;
    return errs;
  }

  const seen = new Map<string, number>();
  qs.forEach((q, i) => {
    const p = `questions[${i}]`;
    const id = q.id.trim();

    if (!id) errs[`${p}.id`] = "is required";
    else if (seen.has(id)) errs[`${p}.id`] = "must be unique";

    const title = q.title.trim();
    if (!title) errs[`${p}.title`] = "is required";
    else if (title.length > LIMITS.title) errs[`${p}.title`] = `must be at most ${LIMITS.title} characters`;

    if (isChoice(q.type)) {
      const opts = q.options ?? [];
      if (opts.length < 2) errs[`${p}.options`] = "needs at least 2 options";
      else if (opts.length > LIMITS.options) errs[`${p}.options`] = `at most ${LIMITS.options} options`;
      else {
        const ids = new Set<string>();
        opts.forEach((o, j) => {
          const op = `${p}.options[${j}]`;
          if (!o.id.trim()) errs[`${op}.id`] = "is required";
          else if (ids.has(o.id)) errs[`${op}.id`] = "must be unique";
          ids.add(o.id);
          const label = o.label.trim();
          if (!label) errs[`${op}.label`] = "is required";
          else if (label.length > LIMITS.label) errs[`${op}.label`] = `must be at most ${LIMITS.label} characters`;
        });
      }
    }

    if (q.type === "rating") {
      const lo = q.min ?? 1;
      const hi = q.max ?? 5;
      if (lo < 0 || hi > LIMITS.ratingMax || lo >= hi) {
        errs[`${p}.max`] = `rating range must satisfy 0 <= min < max <= ${LIMITS.ratingMax}`;
      }
    }

    if (q.showIf) validateCondition(q.showIf, `${p}.showIf`, qs, seen, errs);

    if (id && !seen.has(id)) seen.set(id, i);
  });
  return errs;
}

function validateCondition(
  c: Condition,
  p: string,
  all: Question[],
  earlier: Map<string, number>,
  errs: Record<string, string>,
) {
  const idx = earlier.get(c.questionId);
  if (idx === undefined) {
    errs[`${p}.questionId`] = "must reference an earlier question";
    return;
  }
  const target = all[idx];
  if (target.type === "single_choice" || target.type === "multi_choice") {
    const want = target.type === "multi_choice" ? "includes" : "equals";
    if (c.operator !== want) {
      errs[`${p}.operator`] = `must be "${want}" for a ${target.type} question`;
      return;
    }
    if (typeof c.value !== "string" || !target.options?.some((o) => o.id === c.value)) {
      errs[`${p}.value`] = "must be an option id of the referenced question";
    }
  } else if (target.type === "rating") {
    if (!["equals", "gte", "lte"].includes(c.operator)) {
      errs[`${p}.operator`] = "must be equals, gte or lte for a rating question";
      return;
    }
    const v = c.value;
    if (typeof v !== "number" || !Number.isInteger(v) || v < (target.min ?? 1) || v > (target.max ?? 5)) {
      errs[`${p}.value`] = "must be a whole number within the rating range";
    }
  } else {
    errs[`${p}.questionId`] = "conditions can only reference choice or rating questions";
  }
}

/**
 * Split a flat error map into per-question maps with paths relative to the
 * question, e.g. "questions[2].options[0].label" -> errors[2]["options[0].label"].
 * Accepts server keys too (prefixed with "draftSchema.").
 */
export function errorsByQuestion(errs: Record<string, string>): {
  byQuestion: Record<number, Record<string, string>>;
  other: Record<string, string>;
} {
  const byQuestion: Record<number, Record<string, string>> = {};
  const other: Record<string, string> = {};
  for (const [rawKey, msg] of Object.entries(errs)) {
    const key = rawKey.replace(/^draftSchema\./, "");
    const m = key.match(/^questions\[(\d+)\]\.(.+)$/);
    if (m) {
      const i = Number(m[1]);
      (byQuestion[i] ??= {})[m[2]] = msg;
    } else {
      other[key] = msg;
    }
  }
  return { byQuestion, other };
}

/** Human-readable phrase for a condition, e.g. `"Use it?" is "Yes"`. */
export function describeCondition(c: Condition, questions: Question[]): string {
  const target = questions.find((q) => q.id === c.questionId);
  const name = target?.title.trim() ? `"${target.title.trim()}"` : "an earlier question";
  switch (c.operator) {
    case "includes":
      return `${name} includes "${optionLabel(target, c.value)}"`;
    case "gte":
      return `${name} is ${c.value} or more`;
    case "lte":
      return `${name} is ${c.value} or less`;
    default:
      return target?.type === "rating"
        ? `${name} is ${c.value}`
        : `${name} is "${optionLabel(target, c.value)}"`;
  }
}
