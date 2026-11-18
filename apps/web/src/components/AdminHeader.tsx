"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, LogOut } from "lucide-react";
import { Brand } from "./SiteHeader";
import { Button } from "./ui";

export function AdminHeader({ email, onLogout }: { email: string; onLogout: () => void }) {
  const path = usePathname();
  const onSurveys = path.startsWith("/surveys");

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Brand href="/surveys" />
          <nav aria-label="Admin" className="hidden items-center gap-1 text-sm sm:flex">
            <Link
              href="/surveys"
              aria-current={onSurveys ? "page" : undefined}
              className={`rounded-lg px-3 py-2 font-medium transition-colors duration-200 ${
                onSurveys ? "bg-primary-soft text-accent" : "text-muted hover:bg-subtle hover:text-foreground"
              }`}
            >
              Surveys
            </Link>
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 font-medium text-muted transition-colors duration-200 hover:bg-subtle hover:text-foreground"
            >
              View site <ExternalLink size={14} aria-hidden />
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 text-sm text-muted md:inline-flex" title={email}>
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold uppercase text-accent"
            >
              {email.charAt(0)}
            </span>
            <span className="max-w-[12rem] truncate">{email}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut size={16} aria-hidden />
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
