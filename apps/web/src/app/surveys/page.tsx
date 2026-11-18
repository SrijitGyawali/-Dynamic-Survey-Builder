"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
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

  if (!admin) return <main className="p-8 text-neutral-500">Loading…</main>;

  return (
    <>
      <AdminHeader email={admin.email} onLogout={logout} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Your surveys</h1>

        <form onSubmit={onCreate} className="mb-8 rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-3 font-semibold">New survey</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <input
                placeholder="Title, e.g. Customer feedback"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Survey title"
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
              {createErrors.title && <p className="mt-1 text-xs text-red-600">{createErrors.title}</p>}
            </div>
            <div className="flex-1">
              <input
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-label="Survey description"
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
              {createErrors.description && (
                <p className="mt-1 text-xs text-red-600">{createErrors.description}</p>
              )}
            </div>
            <button
              disabled={creating}
              className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>

        {error && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {surveys === null ? (
          <p className="text-neutral-500">Loading surveys…</p>
        ) : surveys.length === 0 ? (
          <p className="text-neutral-600">No surveys yet. Create your first one above.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {surveys.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/surveys/${s.id}`} className="truncate font-medium hover:underline">
                      {s.title}
                    </Link>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {s.questionCount} question{s.questionCount === 1 ? "" : "s"}
                    {s.currentVersion !== null && ` · v${s.currentVersion}`}
                    {s.currentVersion !== null && s.hasUnpublishedChanges && " · unpublished changes"}
                    {" · updated "}
                    {new Date(s.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2 text-sm">
                  <Link href={`/surveys/${s.id}`} className="rounded-md border px-3 py-1 hover:bg-neutral-100">
                    Open
                  </Link>
                  <button
                    onClick={() => onDelete(s)}
                    className="rounded-md border border-red-200 px-3 py-1 text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
