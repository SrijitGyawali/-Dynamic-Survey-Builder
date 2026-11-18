"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BarChart3, ClipboardList, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminHeader } from "@/components/AdminHeader";
import { AdminLoading } from "@/components/AdminLoading";
import { Alert, Button, Card, IconButton, LinkButton, Skeleton, inputClass } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/lib/api";
import { useAdmin } from "@/lib/auth";
import { createSurvey, deleteSurvey, listSurveys } from "@/lib/surveys";
import type { Survey } from "@/lib/types";

export default function SurveysPage() {
  const router = useRouter();
  const { admin, token, logout } = useAdmin();
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setSurveys(await listSurveys(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load surveys");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setCreateErrors({});
    try {
      const s = await createSurvey(token, title, description);
      router.push(`/surveys/${s.id}`);
    } catch (err) {
      if (err instanceof ApiError) setCreateErrors(err.fields ?? { title: err.message });
      setCreating(false);
    }
  }

  async function onDelete(s: Survey) {
    if (!token) return;
    if (!confirm(`Delete "${s.title}"? Its versions and responses are deleted too. This can't be undone.`)) return;
    try {
      await deleteSurvey(token, s.id);
      setSurveys((list) => list?.filter((x) => x.id !== s.id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete survey");
    }
  }

  if (!admin) return <AdminLoading />;

  return (
    <div className="min-h-screen bg-subtle">
      <AdminHeader email={admin.email} onLogout={logout} />
      <main id="main" className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Surveys</h1>
          <p className="mt-1 text-sm text-muted">Create a survey, build its questions, then publish it to share.</p>
        </div>

        <Card className="mb-8 p-5">
          <form onSubmit={onCreate} noValidate>
            <h2 className="font-semibold">New survey</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-title" className="text-sm font-medium">Title</label>
                <input
                  id="new-title"
                  placeholder="e.g. Customer feedback…"
                  autoComplete="off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-invalid={Boolean(createErrors.title)}
                  aria-describedby={createErrors.title ? "new-title-error" : undefined}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-desc" className="text-sm font-medium">
                  Description <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="new-desc"
                  autoComplete="off"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-invalid={Boolean(createErrors.description)}
                  className={inputClass}
                />
              </div>
              <Button type="submit" disabled={creating}>
                <Plus size={16} aria-hidden />
                {creating ? "Creating…" : "Create survey"}
              </Button>
            </div>
            {(createErrors.title || createErrors.description) && (
              <p id="new-title-error" className="mt-2 text-sm text-danger">
                {createErrors.title ? `Title ${createErrors.title}` : `Description ${createErrors.description}`}
              </p>
            )}
          </form>
        </Card>

        {error && (
          <div className="mb-4">
            <Alert kind="error">{error}</Alert>
          </div>
        )}

        {surveys === null ? (
          <Card className="divide-y divide-border" >
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-5">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </div>
            ))}
          </Card>
        ) : surveys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
            <ClipboardList className="mx-auto text-muted" size={28} aria-hidden />
            <p className="mt-3 font-medium">No surveys yet</p>
            <p className="mt-1 text-sm text-muted">Give your first survey a title above to get started.</p>
          </div>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {surveys.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/surveys/${s.id}`} className="truncate rounded font-medium hover:text-primary">
                        {s.title}
                      </Link>
                      <StatusBadge status={s.status} />
                      {s.listed && s.status === "published" && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <Globe size={12} aria-hidden /> On homepage
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {s.questionCount} question{s.questionCount === 1 ? "" : "s"}
                      {s.currentVersion !== null && ` · v${s.currentVersion}`}
                      {s.currentVersion !== null && s.hasUnpublishedChanges && " · unpublished changes"}
                      {" · updated "}
                      {new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <LinkButton href={`/surveys/${s.id}`} variant="secondary" size="sm">
                      <Pencil size={14} aria-hidden /> Edit
                    </LinkButton>
                    {s.currentVersion !== null && (
                      <LinkButton href={`/surveys/${s.id}/analytics`} variant="secondary" size="sm">
                        <BarChart3 size={14} aria-hidden /> Results
                      </LinkButton>
                    )}
                    <IconButton label={`Delete ${s.title}`} tone="danger" onClick={() => onDelete(s)}>
                      <Trash2 size={16} aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}
