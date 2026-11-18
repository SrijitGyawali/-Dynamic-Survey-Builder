"use client";

import { MAX_TEXT_ANSWER } from "@/lib/answers";
import type { Answers, Question } from "@/lib/types";

type Value = Answers[string] | undefined;

interface Props {
  question: Question;
  number: number;
  value: Value;
  error?: string;
  onChange: (v: Value) => void;
}

// Option tiles: hairline at rest, 2px accent ring when chosen (no layout shift:
// the ring is an inset box-shadow, not a thicker border).
const tile = (checked: boolean) =>
  `flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-[border-color,box-shadow,background-color] duration-150 ${
    checked
      ? "border-ring bg-surface shadow-[inset_0_0_0_1px_var(--ring)]"
      : "border-border-strong bg-surface hover:border-muted/60"
  }`;

/**
 * Renders one question based on its type. Choice and rating questions use a
 * <fieldset>/<legend> so screen readers announce the question with each option.
 */
export function QuestionField({ question: q, number, value, error, onChange }: Props) {
  const errId = `${q.id}-error`;
  const invalid = Boolean(error);

  const heading = (
    <>
      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Question {number}
        {q.required ? "" : " · Optional"}
      </span>
      <span className="type-headline mt-2 block text-balance">
        {q.title}
        {q.required && <span className="sr-only"> (required)</span>}
      </span>
    </>
  );

  const errorText = error && (
    <p id={errId} className="mt-3 text-sm text-danger">
      {error}
    </p>
  );

  const wrapper = "border-t border-border py-10 first:border-t-0";

  if (q.type === "text") {
    return (
      <div className={wrapper} data-invalid={invalid}>
        <label htmlFor={q.id} className="block">
          {heading}
        </label>
        <textarea
          id={q.id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          maxLength={MAX_TEXT_ANSWER}
          aria-invalid={invalid}
          aria-describedby={invalid ? errId : undefined}
          className="mt-5 w-full resize-y rounded-xl border border-border-strong bg-surface px-4 py-3 text-[17px] transition-colors duration-150 placeholder:text-muted/70 hover:border-muted/60 aria-[invalid=true]:border-danger"
          placeholder="Type your answer…"
        />
        {errorText}
      </div>
    );
  }

  if (q.type === "single_choice" || q.type === "multi_choice") {
    const multi = q.type === "multi_choice";
    const selected = multi ? (Array.isArray(value) ? value : []) : value;
    return (
      <fieldset className={wrapper} data-invalid={invalid} aria-describedby={invalid ? errId : undefined}>
        <legend className="float-left w-full">{heading}</legend>
        {multi && <p className="clear-both pt-2 text-sm text-muted">Choose all that apply.</p>}
        <div className="clear-both grid gap-3 pt-5 sm:grid-cols-2">
          {q.options?.map((o) => {
            const checked = multi ? (selected as string[]).includes(o.id) : selected === o.id;
            return (
              <label key={o.id} className={tile(checked)}>
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={q.id}
                  value={o.id}
                  checked={checked}
                  onChange={() => {
                    if (!multi) return onChange(o.id);
                    const list = selected as string[];
                    onChange(checked ? list.filter((x) => x !== o.id) : [...list, o.id]);
                  }}
                  className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--ring)]"
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
        {errorText}
      </fieldset>
    );
  }

  // rating
  const lo = q.min ?? 1;
  const hi = q.max ?? 5;
  const values = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  return (
    <fieldset className={wrapper} data-invalid={invalid} aria-describedby={invalid ? errId : undefined}>
      <legend className="float-left w-full">{heading}</legend>
      <div className="clear-both pt-5">
        <div className="flex flex-wrap gap-2.5">
          {values.map((n) => {
            const checked = value === n;
            return (
              <label key={n} className="cursor-pointer">
                <input
                  type="radio"
                  name={q.id}
                  value={n}
                  checked={checked}
                  onChange={() => onChange(n)}
                  className="peer sr-only"
                />
                <span
                  className={`press flex h-12 w-12 items-center justify-center rounded-full border text-[17px] tabular-nums transition-[background-color,border-color,color,transform] duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring ${
                    checked ? "border-foreground bg-foreground text-white" : "border-border-strong bg-surface hover:border-muted/60"
                  }`}
                >
                  {n}
                </span>
              </label>
            );
          })}
        </div>
        <div
          className="mt-2 flex justify-between text-xs text-muted"
          style={{ maxWidth: `${values.length * 3.625 - 0.625}rem` }}
        >
          <span>Not at all</span>
          <span>Very</span>
        </div>
      </div>
      {errorText}
    </fieldset>
  );
}
