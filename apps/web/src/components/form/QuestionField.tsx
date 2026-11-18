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

/**
 * Renders one question based on its type. Choice and rating questions use a
 * <fieldset>/<legend> so screen readers announce the question with each option.
 */
export function QuestionField({ question: q, number, value, error, onChange }: Props) {
  const errId = `${q.id}-error`;
  const invalid = Boolean(error);
  const heading = (
    <>
      <span className="mr-1 text-neutral-400">{number}.</span>
      {q.title}
      {q.required && (
        <span className="ml-1 text-red-600" aria-hidden>
          *
        </span>
      )}
      {q.required && <span className="sr-only"> (required)</span>}
    </>
  );

  const errorText = error && (
    <p id={errId} className="mt-2 text-sm text-red-600">
      {error}
    </p>
  );

  const wrapper = `rounded-lg border bg-white p-5 transition-colors ${invalid ? "border-red-300" : "border-neutral-200"}`;

  if (q.type === "text") {
    return (
      <div className={wrapper} data-invalid={invalid}>
        <label htmlFor={q.id} className="block font-medium">
          {heading}
        </label>
        <textarea
          id={q.id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={MAX_TEXT_ANSWER}
          aria-invalid={invalid}
          aria-describedby={invalid ? errId : undefined}
          className="mt-3 w-full resize-y rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-500 focus:outline-none"
          placeholder="Your answer"
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
        <legend className="float-left w-full font-medium">{heading}</legend>
        {multi && <p className="clear-both pt-1 text-sm text-neutral-500">Select all that apply</p>}
        <div className="clear-both flex flex-col gap-2 pt-3">
          {q.options?.map((o) => {
            const checked = multi ? (selected as string[]).includes(o.id) : selected === o.id;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                  checked ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50"
                }`}
              >
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
                  className="h-4 w-4 accent-neutral-900"
                />
                {o.label}
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
      <legend className="float-left w-full font-medium">{heading}</legend>
      <div className="clear-both flex flex-wrap gap-2 pt-3">
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
                className={`flex h-11 w-11 items-center justify-center rounded-md border text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                  checked ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                {n}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-neutral-500" style={{ maxWidth: `${values.length * 3.25}rem` }}>
        <span>Low</span>
        <span>High</span>
      </div>
      {errorText}
    </fieldset>
  );
}
