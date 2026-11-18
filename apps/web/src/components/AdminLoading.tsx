import { Skeleton } from "./ui";

/** Shown while the admin session is being checked. */
export function AdminLoading() {
  return (
    <div className="min-h-screen bg-subtle" aria-busy="true" aria-label="Loading">
      <div className="h-16 border-b border-border bg-surface" />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-6 h-32 w-full" />
      </div>
    </div>
  );
}
