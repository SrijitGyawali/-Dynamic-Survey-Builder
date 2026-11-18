import Link from "next/link";

export function AdminHeader({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/surveys" className="font-semibold">
          Survey Builder
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-neutral-600 sm:inline">{email}</span>
          <button onClick={onLogout} className="rounded-md border px-3 py-1 hover:bg-neutral-100">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
