"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
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

  const count = surveys?.length ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        {/* Hero: type only, centred, lots of air */}
        <section className="px-5 pb-16 pt-20 text-center sm:pb-20 sm:pt-28">
          <h1 className="type-hero mx-auto max-w-3xl text-balance">Your opinion, in a few minutes.</h1>
          <p className="type-lead mx-auto mt-5 max-w-xl text-pretty text-muted">
            Choose a survey below and answer at your own pace. No account, no sign-up.
          </p>
        </section>

        {/* Survey list on the alternate surface */}
        <section aria-labelledby="open-surveys" className="bg-subtle px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-[980px]">
            <div className="mb-8 flex items-baseline justify-between gap-4">
              <h2 id="open-surveys" className="type-headline">
                Open surveys
              </h2>
              {surveys && count > 0 && (
                <p className="text-sm text-muted">
                  {count} available
                </p>
              )}
            </div>

            {error ? (
              <div className="rounded-[var(--radius-card)] bg-surface px-6 py-12 text-center">
                <p className="type-headline">Surveys didn&apos;t load.</p>
                <p className="mx-auto mt-2 max-w-md text-muted">
                  The server may be waking up, which can take up to a minute on free hosting.
                </p>
                <Button variant="secondary" className="mt-6" onClick={load}>
                  Try again
                </Button>
              </div>
            ) : surveys === null ? (
              <ul className="grid gap-5 sm:grid-cols-2" aria-busy="true" aria-label="Loading surveys">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="rounded-[var(--radius-card)] bg-surface p-7">
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="mt-4 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-4/5" />
                    <Skeleton className="mt-8 h-4 w-1/3" />
                  </li>
                ))}
              </ul>
            ) : count === 0 ? (
              <div className="rounded-[var(--radius-card)] bg-surface px-6 py-14 text-center">
                <p className="type-headline">No open surveys right now.</p>
                <p className="mt-2 text-muted">Check back later, or use the link you were sent.</p>
              </div>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2">
                {surveys.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/s/${s.slug}`}
                      className="group flex h-full flex-col rounded-[var(--radius-card)] bg-surface p-7 transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                        {s.questionCount} question{s.questionCount === 1 ? "" : "s"} · ~{minutes(s.questionCount)} min
                      </p>
                      <h3 className="type-headline mt-3">{s.title}</h3>
                      {s.description && <p className="mt-2 line-clamp-2 text-muted">{s.description}</p>}
                      <span className="mt-auto pt-8 text-primary group-hover:underline">
                        Start survey <span aria-hidden>›</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
