"use client";

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
                className={`h-4 w-4 shrink-0 border border-neutral-400 ${multi ? "rounded" : "rounded-full"}`}
              />
              <input
                value={o.label}
                onChange={(e) => update(i, e.target.value)}
                aria-label={`Option ${i + 1}`}
                maxLength={LIMITS.label}
                className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-sm ${err ? "border-red-400" : "border-neutral-300"}`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={options.length <= 2}
                title={options.length <= 2 ? "A choice question needs at least 2 options" : "Remove option"}
                aria-label={`Remove option ${i + 1}`}
                className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
            {err && <p className="ml-6 mt-0.5 text-xs text-red-600">{err}</p>}
          </div>
        );
      })}
      {errors.options && <p className="text-xs text-red-600">{errors.options}</p>}
      {options.length < LIMITS.options && (
        <button type="button" onClick={add} className="self-start text-sm text-blue-700 hover:underline">
          + Add option
        </button>
      )}
    </div>
  );
}
