"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LIMITS, TYPE_LABELS, changeType, describeCondition } from "@/lib/schema";
import type { Question, QuestionType } from "@/lib/types";
import { ConditionEditor } from "./ConditionEditor";
import { OptionsEditor } from "./OptionsEditor";

interface Props {
  question: Question;
  index: number;
  questions: Question[];
  errors: Record<string, string>;
  onChange: (q: Question) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

const iconBtn =
  "rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent";

export function QuestionCard({ question: q, index, questions, errors, onChange, onMove, onDuplicate, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-invalid={hasErrors}
      className={`rounded-lg border bg-white p-4 ${isDragging ? "z-10 shadow-lg ring-2 ring-blue-300" : ""} ${
        hasErrors ? "border-red-300" : "border-neutral-200"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder question ${index + 1}`}
          className="cursor-grab touch-none rounded px-1 text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing"
        >
          ⠿
        </button>
        <span className="text-sm font-semibold text-neutral-500">Q{index + 1}</span>

        <select
          aria-label="Question type"
          value={q.type}
          onChange={(e) => onChange(changeType(q, e.target.value as QuestionType))}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
        >
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up" className={iconBtn}>
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === questions.length - 1}
            aria-label="Move down"
            className={iconBtn}
          >
            ↓
          </button>
          <button type="button" onClick={onDuplicate} aria-label="Duplicate question" title="Duplicate" className={iconBtn}>
            ⧉
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Delete question"
            title="Delete"
            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            🗑
          </button>
        </div>
      </div>

      <input
        value={q.title}
        onChange={(e) => onChange({ ...q, title: e.target.value })}
        placeholder="Question text"
        aria-label={`Question ${index + 1} text`}
        maxLength={LIMITS.title}
        className={`w-full rounded-md border px-3 py-2 ${errors.title ? "border-red-400" : "border-neutral-300"}`}
      />
      {errors.title && <p className="mt-1 text-xs text-red-600">Question text {errors.title}</p>}

      <div className="mt-3">
        {(q.type === "single_choice" || q.type === "multi_choice") && (
          <OptionsEditor
            options={q.options ?? []}
            multi={q.type === "multi_choice"}
            errors={errors}
            onChange={(options) => onChange({ ...q, options })}
          />
        )}

        {q.type === "rating" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutral-600">Scale from</span>
            <select
              aria-label="Rating minimum"
              value={q.min ?? 1}
              onChange={(e) => onChange({ ...q, min: Number(e.target.value) })}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1"
            >
              {[0, 1].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span className="text-neutral-600">to</span>
            <select
              aria-label="Rating maximum"
              value={q.max ?? 5}
              onChange={(e) => onChange({ ...q, max: Number(e.target.value) })}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            {errors.max && <p className="w-full text-xs text-red-600">{errors.max}</p>}
          </div>
        )}

        {q.type === "text" && (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-400">
            Respondents type a free-text answer
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-neutral-100 pt-3">
        <ConditionEditor
          questions={questions}
          index={index}
          condition={q.showIf}
          errors={errors}
          onChange={(showIf) => {
            const next = { ...q, showIf };
            if (!showIf) delete next.showIf;
            onChange(next);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={q.required}
            onChange={(e) => onChange({ ...q, required: e.target.checked })}
            className="h-4 w-4"
          />
          Required
          {q.required && q.showIf && (
            <span className="text-xs text-neutral-500">
              (only when shown: {describeCondition(q.showIf, questions)})
            </span>
          )}
        </label>
      </div>
    </li>
  );
}
