import Link from "next/link";
import { Wordmark } from "./Logo";

/** Brand lockup used in both the public and admin headers. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="Survey Builder home" className="inline-flex rounded-lg">
      <Wordmark />
    </Link>
  );
}

/** Header for public pages. The admin entry point is intentionally low-key. */
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground">
          Admin
        </Link>
      </div>
    </header>
  );
}
