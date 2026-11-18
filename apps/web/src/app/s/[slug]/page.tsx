"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Alert, Button, LinkButton, Skeleton } from "@/components/ui";
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

  const progress = shown.length ? Math.round((answeredCount / shown.length) * 100) : 0;

  return (
    <div className="min-h-[100dvh] bg-background">
      <SiteHeader />
      {survey && (
        // Thin progress bar under the header; the counter below repeats it as text.
        <div className="sticky top-0 z-10 h-1 bg-track" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
      <main id="main" className="mx-auto max-w-2xl px-4 py-10">
        {phase.kind === "loading" && (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading survey">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}

        {phase.kind === "unavailable" && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <h1 className="text-xl font-semibold">{phase.title}</h1>
            <p className="mt-2 text-muted">{phase.text}</p>
            <LinkButton href="/" variant="secondary" className="mt-5">
              <ArrowLeft size={16} aria-hidden /> See open surveys
            </LinkButton>
          </div>
        )}

        {phase.kind === "submitted" && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center" role="status">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-accent">
              <CheckCircle2 size={28} aria-hidden />
            </div>
            <h1 className="text-xl font-semibold">Thank you!</h1>
            <p className="mt-2 text-muted">Your response to “{phase.survey.title}” has been recorded.</p>
            <LinkButton href="/" variant="secondary" className="mt-5">
              <ArrowLeft size={16} aria-hidden /> See other surveys
            </LinkButton>
          </div>
        )}

        {survey && (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <header className="rounded-xl border border-border border-t-4 border-t-primary bg-surface p-6">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{survey.title}</h1>
              {survey.description && <p className="mt-2 whitespace-pre-line text-muted">{survey.description}</p>}
              <p className="mt-4 text-sm text-muted">
                <span className="text-danger" aria-hidden>
                  *
                </span>{" "}
                Required question
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

            {banner && <Alert kind="error">{banner}</Alert>}

            <div className="flex items-center justify-between gap-4 pt-2">
              <span className="text-sm text-muted" aria-live="polite">
                {answeredCount} of {shown.length} answered
              </span>
              <Button type="submit" disabled={submitting} className="px-6">
                {submitting && <Loader2 size={16} className="animate-spin" aria-hidden />}
                {submitting ? "Submitting…" : "Submit"}
              </Button>
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
