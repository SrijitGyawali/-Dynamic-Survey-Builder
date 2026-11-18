"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui";
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
      className={`rounded-lg border bg-surface p-5 transition-shadow duration-150 ${isDragging ? "z-10 shadow-lg ring-2 ring-ring" : ""} ${
        hasErrors ? "border-danger" : "border-border"
      }`}
    >
      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder question ${index + 1}`}
          title="Drag to reorder"
          className="-ml-2 inline-flex h-10 w-8 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-subtle hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical size={18} aria-hidden />
        </button>
        <span className="mr-2 text-sm font-semibold text-muted">Q{index + 1}</span>

        <select
          aria-label={`Question ${index + 1} type`}
          value={q.type}
          onChange={(e) => onChange(changeType(q, e.target.value as QuestionType))}
          className="h-9 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-sm hover:border-slate-400"
        >
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center">
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp size={16} aria-hidden />
          </IconButton>
          <IconButton label="Move down" onClick={() => onMove(1)} disabled={index === questions.length - 1}>
            <ArrowDown size={16} aria-hidden />
          </IconButton>
          <IconButton label="Duplicate question" onClick={onDuplicate}>
            <Copy size={16} aria-hidden />
          </IconButton>
          <IconButton label="Delete question" tone="danger" onClick={onRemove}>
            <Trash2 size={16} aria-hidden />
          </IconButton>
        </div>
      </div>

      <input
        value={q.title}
        onChange={(e) => onChange({ ...q, title: e.target.value })}
        placeholder="Question text…"
        aria-label={`Question ${index + 1} text`}
        maxLength={LIMITS.title}
        className={`w-full rounded-md border px-3 py-2 ${errors.title ? "border-danger" : "border-border-strong"}`}
      />
      {errors.title && <p className="mt-1 text-xs text-danger">Question text {errors.title}</p>}

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
            <span className="text-muted">Scale from</span>
            <select
              aria-label="Rating minimum"
              value={q.min ?? 1}
              onChange={(e) => onChange({ ...q, min: Number(e.target.value) })}
              className="rounded-md border border-border-strong bg-surface px-2 py-1"
            >
              {[0, 1].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span className="text-muted">to</span>
            <select
              aria-label="Rating maximum"
              value={q.max ?? 5}
              onChange={(e) => onChange({ ...q, max: Number(e.target.value) })}
              className="rounded-md border border-border-strong bg-surface px-2 py-1"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            {errors.max && <p className="w-full text-xs text-danger">{errors.max}</p>}
          </div>
        )}

        {q.type === "text" && (
          <div className="rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-slate-400">
            Respondents type a free-text answer
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
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
            <span className="text-xs text-muted">
              (only when shown: {describeCondition(q.showIf, questions)})
            </span>
          )}
        </label>
      </div>
    </li>
  );
}
