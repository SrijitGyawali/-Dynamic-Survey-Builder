"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Alert, Button, ChevronLink, Skeleton } from "@/components/ui";
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {survey && (
        // Hairline progress bar under the header; the counter below repeats it as text.
        <div className="sticky top-12 z-20 h-[2px] bg-border/60" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
      <main id="main" className="mx-auto w-full max-w-[692px] flex-1 px-5 pb-24 pt-14 sm:pt-20">
        {phase.kind === "loading" && (
          <div aria-busy="true" aria-label="Loading survey">
            <Skeleton className="mx-auto h-12 w-3/4" />
            <Skeleton className="mx-auto mt-4 h-5 w-1/2" />
            <Skeleton className="mt-16 h-7 w-2/3" />
            <Skeleton className="mt-5 h-24 w-full" />
          </div>
        )}

        {phase.kind === "unavailable" && (
          <div className="pt-6 text-center">
            <h1 className="type-title">{phase.title}</h1>
            <p className="type-lead mx-auto mt-4 max-w-md text-muted">{phase.text}</p>
            <ChevronLink href="/" className="mt-8">
              See open surveys
            </ChevronLink>
          </div>
        )}

        {phase.kind === "submitted" && (
          <div className="pt-6 text-center" role="status">
            <CheckCircle2 size={44} strokeWidth={1.5} className="mx-auto text-primary" aria-hidden />
            <h1 className="type-title mt-6">Thank you.</h1>
            <p className="type-lead mx-auto mt-4 max-w-md text-muted">
              Your response to “{phase.survey.title}” has been recorded.
            </p>
            <ChevronLink href="/" className="mt-8">
              See other surveys
            </ChevronLink>
          </div>
        )}

        {survey && (
          <form onSubmit={onSubmit} noValidate>
            <header className="pb-12 text-center">
              <h1 className="type-title text-balance">{survey.title}</h1>
              {survey.description && (
                <p className="type-lead mx-auto mt-4 max-w-xl whitespace-pre-line text-pretty text-muted">
                  {survey.description}
                </p>
              )}
              <p className="mt-6 text-sm text-muted">
                {shown.length} question{shown.length === 1 ? "" : "s"} · Questions are required unless marked optional.
              </p>
            </header>

            <div className="border-t border-border">
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
            </div>

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
              <div className="mb-6">
                <Alert kind="error">{banner}</Alert>
              </div>
            )}

            <div className="flex flex-col-reverse items-center gap-4 border-t border-border pt-10 sm:flex-row sm:justify-between">
              <span className="text-sm text-muted" aria-live="polite">
                {answeredCount} of {shown.length} answered
              </span>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto sm:min-w-40">
                {submitting && <Loader2 size={17} className="animate-spin" aria-hidden />}
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function unavailable(err: unknown): Phase {
  if (err instanceof ApiError && err.status === 410) {
    return { kind: "unavailable", title: "This survey has closed.", text: "It is no longer accepting responses." };
  }
  if (err instanceof ApiError && err.status === 404) {
    return { kind: "unavailable", title: "Survey not found.", text: "Check the link, or ask the sender for a new one." };
  }
  return { kind: "unavailable", title: "Something went wrong", text: "Could not load the survey. Please try again later." };
}
