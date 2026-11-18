import Link from "next/link";
import { ClipboardList } from "lucide-react";

/** Brand mark used in both the public and admin headers. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-md font-semibold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white">
        <ClipboardList size={18} aria-hidden />
      </span>
      <span translate="no">Survey Builder</span>
    </Link>
  );
}

/** Header for public pages. The admin entry point is intentionally low-key. */
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Brand />
        <Link href="/admin" className="rounded-md px-3 py-2 text-sm text-muted hover:text-foreground">
          Admin
        </Link>
      </div>
    </header>
  );
}
