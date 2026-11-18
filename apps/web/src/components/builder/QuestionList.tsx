"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { LIMITS, TYPE_LABELS, dependentsOf, duplicateQuestion, newQuestion, removeQuestion } from "@/lib/schema";
import type { Question, QuestionType } from "@/lib/types";
import { QuestionCard } from "./QuestionCard";

interface Props {
  questions: Question[];
  errors: Record<number, Record<string, string>>;
  onChange: (questions: Question[]) => void;
}

export function QuestionList({ questions, errors, onChange }: Props) {
  const sensors = useSensors(
    // A small drag distance so clicks on the handle don't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard: focus the handle, Space to pick up, arrows to move, Space to drop.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const replaceAt = (i: number, q: Question) => onChange(questions.map((x, j) => (j === i ? q : x)));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    onChange(arrayMove(questions, from, to));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = questions.findIndex((q) => q.id === active.id);
    const to = questions.findIndex((q) => q.id === over.id);
    move(from, to);
  };

  const remove = (q: Question, i: number) => {
    const deps = dependentsOf(questions, q.id);
    const name = q.title.trim() ? `"${q.title.trim()}"` : `Q${i + 1}`;
    const msg = deps.length
      ? `Delete ${name}? ${deps.length} question(s) are shown based on its answer. Their conditions will be removed, so they will always be shown.`
      : `Delete ${name}?`;
    if (confirm(msg)) onChange(removeQuestion(questions, q.id));
  };

  const add = (type: QuestionType) => onChange([...questions, newQuestion(type)]);

  return (
    <div className="flex flex-col gap-4">
      {questions.length === 0 && (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
          <p className="font-medium">No questions yet</p>
          <p className="mt-1 text-sm text-muted">Choose a question type below to add your first one.</p>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-4">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                questions={questions}
                errors={errors[i] ?? {}}
                onChange={(next) => replaceAt(i, next)}
                onMove={(dir) => move(i, i + dir)}
                onDuplicate={() => onChange([...questions.slice(0, i + 1), duplicateQuestion(q), ...questions.slice(i + 1)])}
                onRemove={() => remove(q, i)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {questions.length < LIMITS.questions && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface p-4">
          <span className="mr-1 text-sm font-medium">Add a question</span>
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className={buttonClass("secondary", "sm")}
            >
              <Plus size={14} aria-hidden /> {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
