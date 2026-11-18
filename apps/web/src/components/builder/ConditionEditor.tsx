"use client";

import { GitBranch } from "lucide-react";
import { conditionTargets, defaultCondition } from "@/lib/schema";
import type { Condition, ConditionOperator, Question } from "@/lib/types";

interface Props {
  questions: Question[];
  index: number; // position of the question being edited
  condition: Condition | undefined;
  errors: Record<string, string>; // "showIf.questionId", "showIf.value", ...
  onChange: (c: Condition | undefined) => void;
}

const selectCls = "rounded-xl border border-border-strong bg-surface px-2 py-1 text-sm";

export function ConditionEditor({ questions, index, condition, errors, onChange }: Props) {
  const targets = conditionTargets(questions, index);
  const enabled = condition !== undefined;
  const target = questions.find((q) => q.id === condition?.questionId);
  const err = errors["showIf.questionId"] ?? errors["showIf.operator"] ?? errors["showIf.value"];

  if (!enabled) {
    return targets.length === 0 ? (
      <p className="text-xs text-muted">
        Tip: add a choice or rating question above this one to show this question conditionally.
      </p>
    ) : (
      <button
        type="button"
        onClick={() => onChange(defaultCondition(targets[targets.length - 1]))}
        className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md py-1 text-sm font-medium text-primary hover:text-primary-hover"
      >
        <GitBranch size={14} aria-hidden /> Show only if…
      </button>
    );
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-3 ${err ? "border-danger bg-danger-soft" : "border-teal-200 bg-primary-soft"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Show only if</span>

        <select
          aria-label="Condition question"
          value={target && targets.includes(target) ? target.id : ""}
          onChange={(e) => {
            const t = targets.find((q) => q.id === e.target.value);
            if (t) onChange(defaultCondition(t));
          }}
          className={`${selectCls} max-w-[16rem]`}
        >
          {!(target && targets.includes(target)) && <option value="">Select a question…</option>}
          {targets.map((q) => (
            <option key={q.id} value={q.id}>
              Q{questions.indexOf(q) + 1}. {q.title.trim() || "(untitled)"}
            </option>
          ))}
        </select>

        {target && targets.includes(target) && condition && (
          <>
            {target.type === "rating" ? (
              <select
                aria-label="Condition operator"
                value={condition.operator}
                onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
                className={selectCls}
              >
                <option value="equals">is</option>
                <option value="gte">is at least</option>
                <option value="lte">is at most</option>
              </select>
            ) : (
              <span>{target.type === "multi_choice" ? "includes" : "is"}</span>
            )}

            {target.type === "rating" ? (
              <select
                aria-label="Condition value"
                value={String(condition.value)}
                onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
                className={selectCls}
              >
                {range(target.min ?? 1, target.max ?? 5).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <select
                aria-label="Condition value"
                value={String(condition.value)}
                onChange={(e) => onChange({ ...condition, value: e.target.value })}
                className={`${selectCls} max-w-[12rem]`}
              >
                {!target.options?.some((o) => o.id === condition.value) && (
                  <option value={String(condition.value)}>Select an option…</option>
                )}
                {target.options?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label.trim() || "(empty option)"}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="ml-auto text-xs text-muted hover:underline"
        >
          Remove condition
        </button>
      </div>
      {err && <p className="text-xs text-danger">{friendlyConditionError(err)}</p>}
    </div>
  );
}

function friendlyConditionError(msg: string): string {
  if (msg.includes("earlier question")) {
    return "This condition points to a question that is no longer above this one. Pick another question or remove the condition.";
  }
  if (msg.includes("option id")) return "The selected option no longer exists. Pick another option.";
  if (msg.includes("rating range")) return "That value is outside the rating range. Pick another value.";
  if (msg.includes("choice or rating")) return "Conditions can only use choice or rating questions.";
  return msg;
}

function range(lo: number, hi: number): number[] {
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
}
