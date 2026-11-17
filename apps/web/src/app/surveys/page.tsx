"use client";

import { useAdmin } from "@/lib/auth";

export default function SurveysPage() {
  const { admin, logout } = useAdmin();

  if (!admin) {
    return <main className="p-8 text-neutral-500">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your surveys</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-600">{admin.email}</span>
          <button onClick={logout} className="rounded-md border px-3 py-1 hover:bg-neutral-100">
            Log out
          </button>
        </div>
      </header>
      <p className="text-neutral-600">No surveys yet. The survey builder comes next.</p>
    </main>
  );
}
