"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Check, ExternalLink, Globe, Lock } from "lucide-react";
import { AdminHeader } from "@/components/AdminHeader";
import { AdminLoading } from "@/components/AdminLoading";
import { Alert, Button, Card, LinkButton } from "@/components/ui";
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
  /** Show on the public homepage once published. */
  listed: boolean;
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
  listed: s.listed,
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
        listed: form.listed,
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

  if (!admin) return <AdminLoading />;

  const needsPublish = survey && (survey.status !== "published" || survey.hasUnpublishedChanges || dirty);
  const publishLabel = !survey
    ? ""
    : survey.currentVersion === null
      ? "Publish"
      : survey.hasUnpublishedChanges || dirty
        ? "Publish changes"
        : "Reopen";
  const saveState = dirty
    ? "Unsaved changes"
    : survey?.hasUnpublishedChanges && survey.currentVersion !== null
      ? "Saved, not published"
      : "All changes saved";

  return (
    <div className="min-h-screen bg-subtle">
      <AdminHeader email={admin.email} onLogout={logout} />

      {notFound ? (
        <main id="main" className="mx-auto max-w-[820px] px-4 py-12 text-center">
          <p className="font-medium">Survey not found</p>
          <p className="mt-1 text-sm text-muted">It may have been deleted.</p>
          <LinkButton href="/surveys" variant="secondary" className="mt-4">
            <ArrowLeft size={16} aria-hidden /> Back to surveys
          </LinkButton>
        </main>
      ) : !survey || !form ? (
        <AdminLoading />
      ) : (
        <>
          {/* Sticky action bar */}
          <div className="frosted sticky top-12 z-20 border-b border-border/70">
            <div className="mx-auto flex max-w-[820px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Link
                href="/surveys"
                className="inline-flex items-center gap-1 rounded-md py-1 text-sm text-muted hover:text-foreground"
              >
                <ArrowLeft size={16} aria-hidden /> Surveys
              </Link>
              <StatusBadge status={survey.status} />
              {survey.currentVersion !== null && <span className="text-xs text-muted">v{survey.currentVersion} live</span>}
              <span className={`text-xs ${dirty ? "font-medium text-amber-700" : "text-muted"}`} aria-live="polite">
                {saveState}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                {survey.currentVersion !== null && (
                  <LinkButton href={`/surveys/${id}/analytics`} variant="ghost" size="sm">
                    <BarChart3 size={16} aria-hidden /> Results
                  </LinkButton>
                )}
                {survey.status === "published" && !dirty && (
                  <Button variant="secondary" size="sm" onClick={close} disabled={busy !== null}>
                    Close survey
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={save} disabled={!dirty || busy !== null}>
                  {busy === "save" ? "Saving…" : "Save draft"}
                </Button>
                {needsPublish && (
                  <Button size="sm" onClick={publish} disabled={busy !== null}>
                    {busy === "publish" ? "Publishing…" : publishLabel}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <main id="main" className="mx-auto max-w-[820px] px-5 py-10">
            {message && (
              <div className="mb-4">
                <Alert kind={message.kind === "error" ? "error" : "success"}>
                  {message.text}
                  {message.kind === "error" && errorCount > 0 && ` (${errorCount} issue${errorCount === 1 ? "" : "s"})`}
                  {other["questions"] && <div>{other["questions"]}</div>}
                </Alert>
              </div>
            )}

            {/* Survey details */}
            <Card className="mb-6 p-5">
              <label htmlFor="survey-title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="survey-title"
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                maxLength={200}
                aria-invalid={Boolean(other.title)}
                className={`mt-1.5 w-full rounded-xl border px-3 py-2 text-lg font-semibold ${
                  other.title ? "border-danger" : "border-border-strong hover:border-slate-400"
                }`}
              />
              {other.title && <p className="mt-1 text-sm text-danger">Title {other.title}</p>}

              <label htmlFor="survey-desc" className="mt-4 block text-sm font-medium">
                Description <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id="survey-desc"
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                maxLength={2000}
                rows={2}
                className="mt-1.5 w-full resize-y rounded-xl border border-border-strong px-3 py-2 text-sm hover:border-slate-400"
              />

              <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Public link</p>
                  {survey.status === "published" ? (
                    <a
                      href={`/s/${survey.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="mt-1 inline-flex items-center gap-1 break-all rounded font-mono text-sm text-primary hover:underline"
                    >
                      /s/{survey.slug} <ExternalLink size={14} aria-hidden />
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-muted">
                      <code translate="no" className="font-mono">/s/{survey.slug}</code>, live once published
                    </p>
                  )}
                </div>
                <ListedSwitch checked={form.listed} onChange={(listed) => update({ listed })} />
              </div>
            </Card>

            <QuestionList
              questions={form.schema.questions}
              errors={byQuestion}
              onChange={(questions) => update({ schema: { ...form.schema, questions } })}
            />

            <section className="mt-10">
              <h2 className="type-headline mb-4">Published versions</h2>
              {versions.length === 0 ? (
                <p className="text-sm text-muted">Not published yet.</p>
              ) : (
                <Card>
                  <ul className="divide-y divide-border text-sm">
                    {versions.map((v) => (
                      <li key={v.version} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-medium">
                          Version {v.version}
                          {v.version === survey.currentVersion && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary-hover">
                              <Check size={12} aria-hidden /> Live
                            </span>
                          )}
                        </span>
                        <span className="text-muted">
                          {v.questionCount} questions · {new Date(v.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </main>
        </>
      )}
    </div>
  );
}

/** Per-survey choice: list on the public homepage, or link-only. */
function ListedSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 sm:max-w-xs">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="listed-label"
        aria-describedby="listed-help"
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 ${
          checked ? "bg-primary" : "bg-slate-300"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform duration-150 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <p id="listed-label" className="inline-flex items-center gap-1.5 text-sm font-medium">
          {checked ? <Globe size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
          Show on homepage
        </p>
        <p id="listed-help" className="mt-0.5 text-sm text-muted">
          {checked
            ? "Listed on the public homepage while published."
            : "Hidden from the homepage. Only people with the link can respond."}
        </p>
      </div>
    </div>
  );
}
