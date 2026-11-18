"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAdmin } from "@/lib/auth";
import { closeSurvey, getSurvey, listVersions, publishSurvey } from "@/lib/surveys";
import type { Survey, SurveyVersion } from "@/lib/types";

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { admin, token, logout } = useAdmin();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [versions, setVersions] = useState<SurveyVersion[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; fields?: string[] } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [s, v] = await Promise.all([getSurvey(token, id), listVersions(token, id)]);
      setSurvey(s);
      setVersions(v);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setMessage({ kind: "error", text: "Could not load the survey" });
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: "publish" | "close") {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const s = action === "publish" ? await publishSurvey(token, id) : await closeSurvey(token, id);
      setSurvey(s);
      setVersions(await listVersions(token, id));
      setMessage({
        kind: "ok",
        text: action === "publish" ? `Published as version ${s.currentVersion}.` : "Survey closed. It no longer accepts responses.",
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage({ kind: "error", text: err.message, fields: err.fields ? Object.values(err.fields) : undefined });
      } else {
        setMessage({ kind: "error", text: "Request failed" });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!admin) return <main className="p-8 text-neutral-500">Loading…</main>;

  return (
    <>
      <AdminHeader email={admin.email} onLogout={logout} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/surveys" className="text-sm text-neutral-600 hover:underline">
          ← All surveys
        </Link>

        {notFound ? (
          <p className="mt-6 text-neutral-600">Survey not found.</p>
        ) : !survey ? (
          <p className="mt-6 text-neutral-500">Loading…</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{survey.title}</h1>
                  <StatusBadge status={survey.status} />
                </div>
                {survey.description && <p className="mt-1 text-neutral-600">{survey.description}</p>}
                <p className="mt-2 text-sm text-neutral-500">
                  Public link (once published): <code className="rounded bg-neutral-100 px-1">/s/{survey.slug}</code>
                </p>
              </div>
              <div className="flex gap-2">
                {(survey.status !== "published" || survey.hasUnpublishedChanges) && (
                  <button
                    onClick={() => run("publish")}
                    disabled={busy}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {survey.status === "closed" && !survey.hasUnpublishedChanges
                      ? "Reopen"
                      : survey.currentVersion === null
                        ? "Publish"
                        : "Publish changes"}
                  </button>
                )}
                {survey.status === "published" && (
                  <button
                    onClick={() => run("close")}
                    disabled={busy}
                    className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50"
                  >
                    Close survey
                  </button>
                )}
              </div>
            </div>

            {message && (
              <div
                role={message.kind === "error" ? "alert" : "status"}
                className={`mt-4 rounded-md px-3 py-2 text-sm ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
              >
                {message.text}
                {message.fields && (
                  <ul className="mt-1 list-disc pl-5">
                    {message.fields.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <section className="mt-8 rounded-lg border border-dashed border-neutral-300 p-6 text-center">
              <p className="font-medium">
                {survey.questionCount} question{survey.questionCount === 1 ? "" : "s"} in the draft
              </p>
              <p className="mt-1 text-sm text-neutral-500">The drag-and-drop question builder is coming in the next phase.</p>
            </section>

            <section className="mt-8">
              <h2 className="mb-3 font-semibold">Published versions</h2>
              {versions.length === 0 ? (
                <p className="text-sm text-neutral-500">Not published yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
                  {versions.map((v) => (
                    <li key={v.version} className="flex justify-between p-3">
                      <span>
                        Version {v.version}
                        {v.version === survey.currentVersion && (
                          <span className="ml-2 text-xs text-green-700">(live)</span>
                        )}
                      </span>
                      <span className="text-neutral-500">
                        {v.questionCount} questions · {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
