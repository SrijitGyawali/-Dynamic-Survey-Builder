"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { QuestionField } from "@/components/form/QuestionField";
import { ApiError } from "@/lib/api";
import { isEmpty, pruneAnswers, validateAnswers, visibleIds } from "@/lib/answers";
import { getPublicSurvey, submitResponse, type PublicSurvey } from "@/lib/public";
import type { Answers } from "@/lib/types";

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; survey: PublicSurvey }
  | { kind: "submitted"; survey: PublicSurvey }
  | { kind: "unavailable"; title: string; text: string };

const scrollToFirstError = () =>
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>("[data-invalid='true']");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  });

export default function PublicSurveyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [answers, setAnswers] = useState<Answers>({});
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot

  useEffect(() => {
    getPublicSurvey(slug)
      .then((survey) => {
        setPhase({ kind: "ready", survey });
        document.title = survey.title;
      })
      .catch((err) => setPhase(unavailable(err)));
  }, [slug]);

  const survey = phase.kind === "ready" ? phase.survey : null;
  const schema = useMemo(() => survey?.schema ?? { questions: [] }, [survey]);
  const visible = useMemo(() => visibleIds(schema, answers), [schema, answers]);
  const shown = schema.questions.filter((q) => visible.has(q.id));
  const clientErrors = useMemo(() => validateAnswers(schema, answers), [schema, answers]);
  const errors = showErrors ? { ...serverErrors, ...clientErrors } : serverErrors;
  const answeredCount = shown.filter((q) => !isEmpty(answers[q.id])).length;

  function setAnswer(id: string, v: Answers[string] | undefined) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return next;
    });
    // A fixed answer clears its server error; others may still apply.
    setServerErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBanner(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!survey || submitting) return;
    setShowErrors(true);
    if (Object.keys(clientErrors).length > 0) {
      setBanner("Please answer the highlighted questions.");
      scrollToFirstError();
      return;
    }
    setSubmitting(true);
    try {
      // Only visible, non-empty answers are sent. The server would drop the rest anyway.
      await submitResponse(slug, survey.version, pruneAnswers(schema, answers), website);
      setPhase({ kind: "submitted", survey });
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.fields) {
          const byQuestion: Record<string, string> = {};
          for (const [k, v] of Object.entries(err.fields)) byQuestion[k.replace(/^answers\./, "")] = v;
          setServerErrors(byQuestion);
          setBanner(err.message);
          scrollToFirstError();
        } else if (err.status === 404 || err.status === 410) {
          setPhase(unavailable(err));
        } else {
          setBanner(err.message); // 409 changed, 429 rate limited, ...
        }
      } else {
        setBanner("Could not reach the server. Please check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="mx-auto max-w-2xl px-4 py-10">
        {phase.kind === "loading" && <p className="text-neutral-500">Loading survey…</p>}

        {phase.kind === "unavailable" && (
          <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
            <h1 className="text-xl font-semibold">{phase.title}</h1>
            <p className="mt-2 text-neutral-600">{phase.text}</p>
          </div>
        )}

        {phase.kind === "submitted" && (
          <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center" role="status">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
              ✓
            </div>
            <h1 className="text-xl font-semibold">Thank you!</h1>
            <p className="mt-2 text-neutral-600">Your response to “{phase.survey.title}” has been recorded.</p>
          </div>
        )}

        {survey && (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <header className="rounded-lg border-t-4 border-neutral-900 bg-white p-6 shadow-sm">
              <h1 className="text-2xl font-bold">{survey.title}</h1>
              {survey.description && <p className="mt-2 whitespace-pre-line text-neutral-600">{survey.description}</p>}
              <p className="mt-3 text-xs text-neutral-500">
                <span className="text-red-600">*</span> Required
              </p>
            </header>

            {shown.map((q, i) => (
              <QuestionField
                key={q.id}
                question={q}
                number={i + 1}
                value={answers[q.id]}
                error={errors[q.id]}
                onChange={(v) => setAnswer(q.id, v)}
              />
            ))}

            {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>

            {banner && (
              <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                {banner}
              </p>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-neutral-500" aria-live="polite">
                {answeredCount} of {shown.length} answered
              </span>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-neutral-900 px-6 py-2.5 font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function unavailable(err: unknown): Phase {
  if (err instanceof ApiError && err.status === 410) {
    return { kind: "unavailable", title: "This survey is closed", text: "It is no longer accepting responses." };
  }
  if (err instanceof ApiError && err.status === 404) {
    return { kind: "unavailable", title: "Survey not found", text: "Check the link, or ask the sender for a new one." };
  }
  return { kind: "unavailable", title: "Something went wrong", text: "Could not load the survey. Please try again later." };
}
