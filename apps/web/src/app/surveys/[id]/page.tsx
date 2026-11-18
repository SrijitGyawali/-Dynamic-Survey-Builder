"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { QuestionList } from "@/components/builder/QuestionList";
import { ApiError } from "@/lib/api";
import { useAdmin } from "@/lib/auth";
import { errorsByQuestion, validateSchema } from "@/lib/schema";
import { closeSurvey, getSurvey, listVersions, publishSurvey, updateSurvey } from "@/lib/surveys";
import type { Survey, SurveySchema, SurveyVersion } from "@/lib/types";

interface Form {
  title: string;
  description: string;
  schema: SurveySchema;
}

type Message = { kind: "ok" | "error"; text: string } | null;

/** After errors render, bring the first highlighted field into view. */
const scrollToFirstError = () =>
  requestAnimationFrame(() =>
    document
      .querySelector("[data-invalid='true']")
      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
  );

const formFrom = (s: Survey): Form => ({
  title: s.title,
  description: s.description,
  schema: s.draftSchema ?? { questions: [] },
});

export default function SurveyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { admin, token, logout } = useAdmin();

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [versions, setVersions] = useState<SurveyVersion[]>([]);
  const [notFound, setNotFound] = useState(false);

  // The form being edited, and a snapshot of what's saved on the server.
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<string>("");
  const dirty = form !== null && JSON.stringify(form) !== saved;

  const [busy, setBusy] = useState<null | "save" | "publish" | "close">(null);
  const [message, setMessage] = useState<Message>(null);
  // Errors are hidden until the first save attempt, then update live.
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const applySurvey = useCallback((s: Survey) => {
    const f = formFrom(s);
    setSurvey(s);
    setForm(f);
    setSaved(JSON.stringify(f));
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.all([getSurvey(token, id), listVersions(token, id)])
      .then(([s, v]) => {
        applySurvey(s);
        setVersions(v);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setMessage({ kind: "error", text: "Could not load the survey" });
      });
  }, [token, id, applySurvey]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Live client-side validation (same rules as the API).
  const clientErrors = useMemo(() => {
    if (!form) return {};
    const errs: Record<string, string> = { ...validateSchema(form.schema) };
    if (!form.title.trim()) errs.title = "is required";
    return errs;
  }, [form]);

  const visibleErrors = showErrors ? { ...serverErrors, ...clientErrors } : serverErrors;
  const { byQuestion, other } = errorsByQuestion(visibleErrors);
  const errorCount = Object.keys(visibleErrors).length;

  const update = (patch: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setServerErrors({}); // paths may shift after an edit; recompute locally
    setMessage(null);
  };

  /** Saves the draft. Returns true on success. */
  async function save(): Promise<boolean> {
    if (!token || !form) return false;
    setShowErrors(true);
    if (Object.keys(clientErrors).length > 0) {
      setMessage({ kind: "error", text: "Fix the highlighted problems before saving." });
      scrollToFirstError();
      return false;
    }
    setBusy("save");
    try {
      const s = await updateSurvey(token, id, {
        title: form.title,
        description: form.description,
        draftSchema: form.schema,
      });
      applySurvey(s);
      setServerErrors({});
      setMessage({ kind: "ok", text: "Draft saved." });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setServerErrors(err.fields);
        scrollToFirstError();
      }
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not save" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!token) return;
    if (dirty && !(await save())) return; // publish what the admin sees
    setBusy("publish");
    try {
      const s = await publishSurvey(token, id);
      applySurvey(s);
      setVersions(await listVersions(token, id));
      setMessage({ kind: "ok", text: `Published. Version ${s.currentVersion} is live.` });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setShowErrors(true);
        setServerErrors(err.fields);
      }
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not publish" });
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    if (!token) return;
    setBusy("close");
    try {
      const s = await closeSurvey(token, id);
      setSurvey(s);
      setMessage({ kind: "ok", text: "Survey closed. It no longer accepts responses." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not close" });
    } finally {
      setBusy(null);
    }
  }

  if (!admin) return <main className="p-8 text-neutral-500">Loading…</main>;

  const needsPublish = survey && (survey.status !== "published" || survey.hasUnpublishedChanges || dirty);
  const publishLabel = !survey
    ? ""
    : survey.currentVersion === null
      ? "Publish"
      : survey.hasUnpublishedChanges || dirty
        ? "Publish changes"
        : "Reopen";

  return (
    <>
      <AdminHeader email={admin.email} onLogout={logout} />

      {notFound ? (
        <main className="mx-auto max-w-3xl px-4 py-8 text-neutral-600">
          Survey not found. <Link href="/surveys" className="underline">Back to surveys</Link>
        </main>
      ) : !survey || !form ? (
        <main className="mx-auto max-w-3xl px-4 py-8 text-neutral-500">Loading…</main>
      ) : (
        <>
          {/* Sticky action bar */}
          <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
              <Link href="/surveys" className="text-sm text-neutral-600 hover:underline">
                ← Surveys
              </Link>
              <StatusBadge status={survey.status} />
              {survey.currentVersion !== null && (
                <span className="text-xs text-neutral-500">v{survey.currentVersion} live</span>
              )}
              <span className="text-xs text-neutral-500">
                {dirty ? "• Unsaved changes" : survey.hasUnpublishedChanges && survey.currentVersion !== null ? "• Saved, not published" : ""}
              </span>
              <div className="ml-auto flex gap-2">
                {survey.currentVersion !== null && (
                  <Link
                    href={`/surveys/${id}/analytics`}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
                  >
                    Results
                  </Link>
                )}
                <button
                  onClick={save}
                  disabled={!dirty || busy !== null}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40"
                >
                  {busy === "save" ? "Saving…" : "Save draft"}
                </button>
                {needsPublish && (
                  <button
                    onClick={publish}
                    disabled={busy !== null}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {busy === "publish" ? "Publishing…" : publishLabel}
                  </button>
                )}
                {survey.status === "published" && !dirty && (
                  <button
                    onClick={close}
                    disabled={busy !== null}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>

          <main className="mx-auto max-w-3xl px-4 py-6">
            {message && (
              <div
                role={message.kind === "error" ? "alert" : "status"}
                className={`mb-4 rounded-md px-3 py-2 text-sm ${
                  message.kind === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
                }`}
              >
                {message.text}
                {message.kind === "error" && errorCount > 0 && ` (${errorCount} issue${errorCount === 1 ? "" : "s"})`}
                {other["questions"] && <div>{other["questions"]}</div>}
              </div>
            )}

            {/* Survey meta */}
            <section className="mb-6 rounded-lg border border-neutral-200 p-4">
              <input
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                aria-label="Survey title"
                placeholder="Survey title"
                maxLength={200}
                className={`w-full rounded-md border px-3 py-2 text-xl font-bold ${
                  other.title ? "border-red-400" : "border-transparent hover:border-neutral-300"
                }`}
              />
              {other.title && <p className="mt-1 text-xs text-red-600">Title {other.title}</p>}
              <textarea
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                aria-label="Survey description"
                placeholder="Description (optional)"
                maxLength={2000}
                rows={2}
                className="mt-2 w-full resize-y rounded-md border border-transparent px-3 py-2 text-neutral-700 hover:border-neutral-300"
              />
              <p className="px-3 text-xs text-neutral-500">
                Public link:{" "}
                {survey.status === "published" ? (
                  <a
                    href={`/s/${survey.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="rounded bg-neutral-100 px-1 font-mono text-blue-700 hover:underline"
                  >
                    /s/{survey.slug} ↗
                  </a>
                ) : (
                  <>
                    <code className="rounded bg-neutral-100 px-1">/s/{survey.slug}</code> (works once published)
                  </>
                )}
              </p>
            </section>

            <QuestionList
              questions={form.schema.questions}
              errors={byQuestion}
              onChange={(questions) => update({ schema: { ...form.schema, questions } })}
            />

            <section className="mt-10">
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
          </main>
        </>
      )}
    </>
  );
}
