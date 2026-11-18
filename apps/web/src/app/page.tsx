"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Clock, ListChecks, RefreshCw } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button, Skeleton } from "@/components/ui";
import { listPublicSurveys, type ListedSurvey } from "@/lib/public";

// Roughly 20 seconds per question, rounded up to whole minutes.
const minutes = (questions: number) => Math.max(1, Math.ceil((questions * 20) / 60));

export default function HomePage() {
  const [surveys, setSurveys] = useState<ListedSurvey[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setSurveys(null);
    listPublicSurveys()
      .then(setSurveys)
      .catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="flex min-h-screen flex-col bg-subtle">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-16">
        <section className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Open surveys</h1>
          <p className="mt-3 text-lg text-muted text-pretty">
            Pick a survey and share your answers. No account needed, and most take only a couple of minutes.
          </p>
        </section>

        {error ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <p className="font-medium">We couldn&apos;t load the surveys.</p>
            <p className="mt-1 text-sm text-muted">
              The server may be waking up. This can take up to a minute on the free hosting plan.
            </p>
            <Button variant="secondary" className="mt-4" onClick={load}>
              <RefreshCw size={16} aria-hidden /> Try again
            </Button>
          </div>
        ) : surveys === null ? (
          <ul className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading surveys">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="rounded-lg border border-border bg-surface p-6">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
                <Skeleton className="mt-6 h-4 w-1/3" />
              </li>
            ))}
          </ul>
        ) : surveys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
            <ListChecks className="mx-auto text-muted" size={28} aria-hidden />
            <p className="mt-3 font-medium">No open surveys right now</p>
            <p className="mt-1 text-sm text-muted">Check back later, or use the link you were sent.</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {surveys.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/s/${s.slug}`}
                  className="group flex h-full flex-col rounded-lg border border-border bg-surface p-6 transition-colors duration-150 hover:border-primary"
                >
                  <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
                  {s.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{s.description}</p>}
                  <div className="mt-auto flex items-center justify-between pt-6 text-sm">
                    <span className="inline-flex items-center gap-3 text-muted">
                      <span>
                        {s.questionCount} question{s.questionCount === 1 ? "" : "s"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={14} aria-hidden /> ~{minutes(s.questionCount)} min
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      Start
                      <ArrowRight size={16} aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="border-t border-border bg-surface">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted">
          Responses are anonymous. We store your answers, not your identity.
        </p>
      </footer>
    </div>
  );
}
