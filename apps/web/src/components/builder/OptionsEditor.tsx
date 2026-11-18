"use client";

import { Plus, X } from "lucide-react";
import { LIMITS, newOptionId } from "@/lib/schema";
import type { Option } from "@/lib/types";

interface Props {
  options: Option[];
  multi: boolean;
  errors: Record<string, string>; // keys relative to the question: "options", "options[1].label"
  onChange: (options: Option[]) => void;
}

export function OptionsEditor({ options, multi, errors, onChange }: Props) {
  const update = (i: number, label: string) =>
    onChange(options.map((o, j) => (j === i ? { ...o, label } : o)));

  const remove = (i: number) => onChange(options.filter((_, j) => j !== i));

  const add = () => onChange([...options, { id: newOptionId(), label: `Option ${options.length + 1}` }]);

  return (
    <div className="flex flex-col gap-2">
      {options.map((o, i) => {
        const err = errors[`options[${i}].label`] ?? errors[`options[${i}].id`];
        return (
          <div key={o.id}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`h-4 w-4 shrink-0 border border-faint ${multi ? "rounded" : "rounded-full"}`}
              />
              <input
                value={o.label}
                onChange={(e) => update(i, e.target.value)}
                aria-label={`Option ${i + 1}`}
                maxLength={LIMITS.label}
                className={`h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm hover:border-faint ${err ? "border-danger" : "border-border-strong"}`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={options.length <= 2}
                title={options.length <= 2 ? "A choice question needs at least 2 options" : "Remove option"}
                aria-label={`Remove option ${i + 1}`}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            {err && <p className="ml-6 mt-0.5 text-xs text-danger">{err}</p>}
          </div>
        );
      })}
      {errors.options && <p className="text-xs text-danger">{errors.options}</p>}
      {options.length < LIMITS.options && (
        <button
          type="button"
          onClick={add}
          className="inline-flex cursor-pointer items-center gap-1 self-start rounded-lg py-1 text-sm font-medium text-accent hover:text-foreground"
        >
          <Plus size={16} aria-hidden /> Add option
        </button>
      )}
    </div>
  );
}
