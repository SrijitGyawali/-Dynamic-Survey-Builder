"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AdminLoading } from "@/components/AdminLoading";
import { StatusBadge } from "@/components/StatusBadge";
import { ChartWithTable, ColumnChart } from "@/components/analytics/Charts";
import { QuestionResult } from "@/components/analytics/QuestionResult";
import { ApiError } from "@/lib/api";
import { formatNumber, getAnalytics, timeAgo, type Analytics } from "@/lib/analytics";
import { useAdmin } from "@/lib/auth";

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { admin, token, logout } = useAdmin();
  const [version, setVersion] = useState<number | null>(null);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false; // ignore a slow response after the filter changed
    setLoading(true);
    getAnalytics(token, id, version)
      .then((a) => !cancelled && (setData(a), setError(null)))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load analytics"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, id, version]);

  if (!admin || !token) return <AdminLoading />;

  const last7 = data?.daily.slice(-7).reduce((s, d) => s + d.count, 0) ?? 0;

  return (
    <div className="min-h-[100dvh] bg-background">
      <AdminHeader email={admin.email} onLogout={logout} />
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-1 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/surveys" className="text-muted hover:underline">
            ← Surveys
          </Link>
          <Link href={`/surveys/${id}`} className="text-muted hover:underline">
            Edit survey
          </Link>
        </div>

        {error && !data && <p className="mt-6 text-muted">{error}</p>}

        {data && (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{data.title}</h1>
                  <StatusBadge status={data.status} />
                </div>
                <p className="text-sm text-muted">Results</p>
              </div>

              {/* Filters live in one row above the charts */}
              {data.byVersion.length > 1 && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Version</span>
                  <select
                    value={version ?? ""}
                    onChange={(e) => setVersion(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-lg border border-border-strong bg-surface px-2 py-1.5"
                  >
                    <option value="">All versions</option>
                    {data.byVersion.map((v) => (
                      <option key={v.version} value={v.version}>
                        Version {v.version}
                        {v.version === data.currentVersion ? " (live)" : ""} · {v.count}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {data.currentVersion === null ? (
              <Empty text="This survey hasn't been published yet. Publish it and share the link to start collecting responses." />
            ) : (
              <div className={`flex flex-col gap-6 transition-opacity ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
                {/* Stat tiles */}
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Tile label="Total responses" value={formatNumber(data.totalResponses)} hero />
                  <Tile label="Last 7 days" value={formatNumber(last7)} />
                  <Tile
                    label="Last response"
                    value={data.lastResponseAt ? timeAgo(data.lastResponseAt) : "None yet"}
                    title={data.lastResponseAt ? new Date(data.lastResponseAt).toLocaleString() : undefined}
                  />
                </section>

                {data.totalResponses === 0 ? (
                  <Empty text="No responses yet. Share the public link to start collecting answers." />
                ) : (
                  <>
                    <section className="rounded-xl border border-border bg-surface p-5">
                      <h2 className="font-semibold">Responses per day</h2>
                      <p className="mb-3 text-sm text-muted">Last 30 days</p>
                      <ChartWithTable
                        chart={<ColumnChart data={data.daily} />}
                        headers={["Date", "Responses"]}
                        rows={data.daily.filter((d) => d.count > 0).reverse().map((d) => [d.date, d.count])}
                      />
                    </section>

                    <section className="flex flex-col gap-4">
                      <h2 className="font-semibold">Questions</h2>
                      {data.questions.map((q, i) => (
                        <QuestionResult
                          key={`${version}-${q.id}`}
                          q={q}
                          index={i}
                          total={data.totalResponses}
                          token={token}
                          surveyId={id}
                          version={version}
                        />
                      ))}
                    </section>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Tile({ label, value, hero, title }: { label: string; value: string; hero?: boolean; title?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${hero ? "col-span-2 sm:col-span-1" : ""}`} title={title}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${hero ? "text-4xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border-strong p-8 text-center text-muted">{text}</p>;
}
