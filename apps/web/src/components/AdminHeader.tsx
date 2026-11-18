import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import { Brand } from "./SiteHeader";
import { Button } from "./ui";

export function AdminHeader({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Brand href="/surveys" />
          <nav aria-label="Admin" className="hidden items-center gap-1 text-sm sm:flex">
            <Link href="/surveys" className="rounded-md px-3 py-2 font-medium text-foreground hover:bg-subtle">
              Surveys
            </Link>
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-muted hover:bg-subtle hover:text-foreground"
            >
              View site <ExternalLink size={14} aria-hidden />
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted md:inline">{email}</span>
          <Button variant="secondary" size="sm" onClick={onLogout}>
            <LogOut size={16} aria-hidden />
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
