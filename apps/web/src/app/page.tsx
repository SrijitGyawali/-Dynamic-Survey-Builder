"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Clock, ListChecks, RefreshCw, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
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
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        {/* Hero: left-aligned message, the brand tile as the visual (hidden on phones). */}
        <section className="grid items-center gap-10 py-12 sm:py-16 md:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-balance sm:text-5xl">
              Your answers shape <span className="text-accent">what gets built</span>
            </h1>
            <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-muted text-pretty">
              Pick a survey below. No account needed, and most take about two minutes.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted">
              <ShieldCheck size={16} aria-hidden className="text-accent" />
              Responses are anonymous. We keep your answers, not your identity.
            </p>
          </div>
          <div aria-hidden className="hidden md:block">
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary-soft" />
              <div className="flex h-44 w-44 rotate-[-4deg] items-center justify-center rounded-[2.25rem] bg-[#161b3d] shadow-raised">
                <LogoMark size={104} inverted />
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="open-surveys" className="pb-16">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 id="open-surveys" className="text-xl font-semibold tracking-tight">
              Open surveys
            </h2>
            {surveys && surveys.length > 0 && (
              <span className="text-sm tabular-nums text-muted">
                {surveys.length} available
              </span>
            )}
          </div>

          {error ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
              <p className="font-semibold">We couldn&apos;t load the surveys</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                The server may be waking up, which can take up to a minute on the free hosting plan.
              </p>
              <Button variant="secondary" className="mt-5" onClick={load}>
                <RefreshCw size={16} aria-hidden /> Try again
              </Button>
            </div>
          ) : surveys === null ? (
            <ul className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading surveys">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="rounded-xl border border-border bg-surface p-6 shadow-card">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-4/5" />
                  <Skeleton className="mt-8 h-9 w-full" />
                </li>
              ))}
            </ul>
          ) : surveys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-accent">
                <ListChecks size={22} aria-hidden />
              </span>
              <p className="mt-4 font-semibold">No open surveys right now</p>
              <p className="mt-1 text-sm text-muted">Check back later, or use the link you were sent.</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {surveys.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/s/${s.slug}`}
                    className="group flex h-full flex-col rounded-xl border border-border bg-surface p-6 shadow-card transition-[border-color,box-shadow,transform] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised"
                  >
                    <h3 className="text-lg font-semibold tracking-tight text-balance">{s.title}</h3>
                    {s.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{s.description}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-4 pt-6">
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                        <Clock size={15} aria-hidden />
                        <span className="tabular-nums">
                          {s.questionCount} question{s.questionCount === 1 ? "" : "s"}, about {minutes(s.questionCount)} min
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-semibold text-accent transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                        Start
                        <ArrowRight
                          size={15}
                          aria-hidden
                          className="transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5"
                        />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span translate="no">Survey Builder</span>
          <Link href="/admin" className="rounded-lg hover:text-foreground">
            Admin sign-in
          </Link>
        </div>
      </footer>
    </div>
  );
}
