import Link from "next/link";

/** Wordmark. Type does the branding; no logo tile. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      translate="no"
      className="rounded-md text-[17px] font-semibold tracking-[-0.02em] text-foreground"
    >
      Survey<span className="text-muted">Builder</span>
    </Link>
  );
}

/** Thin frosted bar for public pages. The admin entry is deliberately quiet. */
export function SiteHeader() {
  return (
    <header className="frosted sticky top-0 z-30 border-b border-border/70">
      <div className="mx-auto flex h-12 max-w-[980px] items-center justify-between px-5">
        <Brand />
        <nav aria-label="Site" className="flex items-center gap-6 text-xs text-muted">
          <Link href="/" className="rounded hover:text-foreground">
            Surveys
          </Link>
          <Link href="/admin" className="rounded hover:text-foreground">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Quiet footer on the alternate surface. */
export function SiteFooter() {
  return (
    <footer className="bg-subtle">
      <div className="mx-auto flex max-w-[980px] flex-col gap-1 border-t border-border px-5 py-6 text-xs text-muted sm:flex-row sm:justify-between">
        <p>Responses are anonymous. We store your answers, never your identity.</p>
        <p translate="no">SurveyBuilder</p>
      </div>
    </footer>
  );
}
