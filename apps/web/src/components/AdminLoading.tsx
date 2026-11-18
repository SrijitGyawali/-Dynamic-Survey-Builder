import { Skeleton } from "./ui";

/** Shown while the admin session is being checked. */
export function AdminLoading() {
  return (
    <div className="min-h-screen bg-subtle" aria-busy="true" aria-label="Loading">
      <div className="frosted h-12 border-b border-border/70" />
      <div className="mx-auto max-w-[1068px] px-5 py-14">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="mt-8 h-40 w-full" />
      </div>
    </div>
  );
}
