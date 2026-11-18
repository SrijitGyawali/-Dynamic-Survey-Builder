"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./SiteHeader";

export function AdminHeader({ email, onLogout }: { email: string; onLogout: () => void }) {
  const path = usePathname();
  const onSurveys = path === "/surveys";
  return (
    <header className="frosted sticky top-0 z-30 border-b border-border/70">
      <div className="mx-auto flex h-12 max-w-[1068px] items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-8">
          <Brand href="/surveys" />
          <nav aria-label="Admin" className="hidden items-center gap-6 text-xs sm:flex">
            <Link
              href="/surveys"
              aria-current={onSurveys ? "page" : undefined}
              className={`rounded ${onSurveys ? "text-foreground" : "text-muted hover:text-foreground"}`}
            >
              Surveys
            </Link>
            <Link href="/" target="_blank" className="rounded text-muted hover:text-foreground">
              View site ↗
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-5 text-xs">
          <span className="hidden text-muted md:inline">{email}</span>
          <button type="button" onClick={onLogout} className="cursor-pointer rounded text-primary hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
