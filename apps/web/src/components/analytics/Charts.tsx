"use client";

// Small, dependency-free charts built from HTML + CSS.
// Chart rules followed (from our data-viz guidelines):
//  - one series per chart, so one hue (--series-1) and no legend box
//  - bars at most 24px thick, 4px rounded data-end, square at the baseline
//  - text always in neutral ink, never in the series color
//  - every chart has a table view, and every mark has an accessible label

import { useState } from "react";
import { pct } from "@/lib/analytics";

export interface BarDatum {
  key: string;
  label: string;
  count: number;
  muted?: boolean; // e.g. "options removed in a later version"
}

/** Horizontal bars: label, bar, "count · percent". */
export function HorizontalBars({ data, base, unit = "responses" }: { data: BarDatum[]; base: number; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => {
        const share = pct(d.count, base);
        return (
          // Phones: label on its own line, then bar + value. Wider: one row of label | bar | value.
          <li
            key={d.key}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(6rem,11rem)_1fr_auto]"
          >
            <span
              className={`col-span-2 truncate sm:col-span-1 ${d.muted ? "italic text-muted" : "text-foreground"}`}
              title={d.label}
            >
              {d.label}
            </span>
            <span className="h-5" role="img" aria-label={`${d.label}: ${d.count} ${unit}, ${share}%`}>
              <span
                className="block h-full rounded-r-[4px] transition-[width] duration-500"
                style={{
                  width: `${(d.count / max) * 100}%`,
                  minWidth: d.count > 0 ? 2 : 0,
                  background: d.muted ? "var(--series-muted)" : "var(--series-1)",
                }}
              />
            </span>
            <span className="min-w-[5.5rem] text-right tabular-nums text-foreground">
              {d.count} <span className="text-muted">· {share}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical columns over time with a hover/focus tooltip per column. */
export function ColumnChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts);

  return (
    <div>
      <div className="flex h-36 items-end gap-[2px] border-b border-border-strong" role="list">
        {data.map((d) => (
          <div
            key={d.date}
            role="listitem"
            tabIndex={0}
            aria-label={`${fmt(d.date, { month: "long", day: "numeric" })}: ${d.count} responses`}
            className="group relative flex h-full flex-1 items-end justify-center outline-none"
          >
            <span
              className="w-full max-w-[24px] rounded-t-[4px] group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ring"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 2 : 0, background: "var(--series-1)" }}
            />
            <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs text-white shadow group-hover:block group-focus-visible:block">
              {fmt(d.date, { month: "short", day: "numeric" })} · <strong>{d.count}</strong>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{data[0] && fmt(data[0].date, { month: "short", day: "numeric" })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** Wraps a chart with a "Chart / Table" toggle. */
export function ChartWithTable({
  chart,
  rows,
  headers,
}: {
  chart: React.ReactNode;
  rows: (string | number)[][];
  headers: string[];
}) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div className="inline-flex rounded-xl border border-border p-0.5 text-xs" role="group" aria-label="View">
          {["Chart", "Table"].map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={(v === "Table") === table}
              onClick={() => setTable(v === "Table")}
              className={`rounded px-2 py-0.5 ${(v === "Table") === table ? "bg-primary text-white" : "text-muted hover:bg-subtle"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              {headers.map((h, i) => (
                <th key={h} className={`py-1.5 font-medium ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-b border-border">
                {r.map((c, i) => (
                  <td key={i} className={`py-1.5 ${i > 0 ? "text-right tabular-nums" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        chart
      )}
    </div>
  );
}
