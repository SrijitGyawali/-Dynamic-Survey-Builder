"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  REMOVED_OPTIONS_ID,
  getTextAnswers,
  pct,
  timeAgo,
  type QuestionStats,
  type TextAnswer,
} from "@/lib/analytics";
import { TYPE_LABELS } from "@/lib/schema";
import { ChartWithTable, HorizontalBars } from "./Charts";

interface Props {
  q: QuestionStats;
  index: number;
  total: number; // total responses in the current filter
  token: string;
  surveyId: string;
  version: number | null;
}

export function QuestionResult({ q, index, total, token, surveyId, version }: Props) {
  const skipped = total - q.answered;

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-semibold">Q{index + 1}</span>
          <span>{TYPE_LABELS[q.type]}</span>
          {q.conditional && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary-hover">Conditional</span>}
          {q.required && <span>Required</span>}
        </div>
        <h3 className="mt-1 font-semibold">{q.title}</h3>
        <p className="mt-0.5 text-sm text-muted">
          {q.answered} answered
          {total > 0 && skipped > 0 && (
            <> · {q.conditional ? `${skipped} didn't see it or skipped` : `${skipped} skipped`}</>
          )}
        </p>
      </header>

      {q.answered === 0 ? (
        <p className="text-sm text-muted">No answers yet.</p>
      ) : q.options ? (
        <ChoiceResult q={q} />
      ) : q.rating ? (
        <RatingResult q={q} />
      ) : (
        <TextResult q={q} token={token} surveyId={surveyId} version={version} />
      )}
    </article>
  );
}

function ChoiceResult({ q }: { q: QuestionStats }) {
  const opts = q.options ?? [];
  const multi = q.type === "multi_choice";
  const data = opts.map((o) => ({
    key: o.id,
    label: o.label,
    count: o.count,
    muted: o.id === REMOVED_OPTIONS_ID,
  }));
  return (
    <>
      <ChartWithTable
        chart={<HorizontalBars data={data} base={q.answered} />}
        headers={["Option", "Responses", "Share"]}
        rows={opts.map((o) => [o.label, o.count, `${pct(o.count, q.answered)}%`])}
      />
      {multi && (
        <p className="mt-3 text-xs text-muted">
          Respondents could pick several options, so shares add up to more than 100%.
        </p>
      )}
    </>
  );
}

function RatingResult({ q }: { q: QuestionStats }) {
  const r = q.rating!;
  // Highest value on top reads naturally for a rating ("5 ★" first).
  const dist = [...r.distribution].reverse();
  return (
    <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
      <div>
        <p className="text-sm text-muted">Average</p>
        <p className="text-4xl font-semibold tabular-nums">
          {r.average?.toFixed(2) ?? "–"}
          <span className="text-lg font-normal text-muted"> / {r.max}</span>
        </p>
        {/* Thin meter: the average's position on the scale */}
        {r.average !== null && (
          <div
            className="mt-3 h-2 rounded-full bg-slate-100"
            role="meter"
            aria-valuemin={r.min}
            aria-valuemax={r.max}
            aria-valuenow={r.average}
            aria-label="Average rating"
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${((r.average - r.min) / (r.max - r.min)) * 100}%`, background: "var(--series-1)" }}
            />
          </div>
        )}
      </div>
      <ChartWithTable
        chart={
          <HorizontalBars data={dist.map((d) => ({ key: String(d.value), label: `${d.value} ★`, count: d.count }))} base={q.answered} />
        }
        headers={["Rating", "Responses", "Share"]}
        rows={dist.map((d) => [d.value, d.count, `${pct(d.count, q.answered)}%`])}
      />
    </div>
  );
}

function TextResult({
  q,
  token,
  surveyId,
  version,
}: {
  q: QuestionStats;
  token: string;
  surveyId: string;
  version: number | null;
}) {
  const initial = q.text?.latest ?? [];
  const [answers, setAnswers] = useState<TextAnswer[]>(initial);
  // The summary sends the latest 5; if there are more, the first "load more"
  // fetches from the start of the list with the pagination endpoint.
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(q.answered > initial.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const page = await getTextAnswers(token, surveyId, q.id, { version, cursor, limit: 20 });
      setAnswers((prev) => {
        const seen = new Set(prev.map((a) => a.responseId));
        return cursor === null ? page.answers : [...prev, ...page.answers.filter((a) => !seen.has(a.responseId))];
      });
      setCursor(page.nextCursor);
      setMore(page.nextCursor !== null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load answers");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {answers.map((a) => (
          <li key={a.responseId} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <p className="whitespace-pre-line text-sm text-foreground">{a.answer}</p>
            <time dateTime={a.submittedAt} className="shrink-0 text-xs text-muted" title={new Date(a.submittedAt).toLocaleString()}>
              {timeAgo(a.submittedAt)}
            </time>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="text-muted">
          Showing {answers.length} of {q.answered}
        </span>
        {more && (
          <button type="button" onClick={loadMore} disabled={loading} className="text-primary hover:underline disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
        {error && <span className="text-danger">{error}</span>}
      </div>
    </div>
  );
}
