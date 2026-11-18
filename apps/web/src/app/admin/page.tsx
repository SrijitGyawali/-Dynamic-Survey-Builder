"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Brand } from "@/components/SiteHeader";
import { Alert, Button, inputClass } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { getToken, login, setToken } from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already signed in? Go straight to the dashboard (an expired token is
  // caught there and sends the admin back here).
  useEffect(() => {
    if (getToken()) router.replace("/surveys");
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await login(email, password);
      setToken(res.token);
      router.push("/surveys");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("Incorrect email or password.");
      else if (err instanceof ApiError && err.status === 429) setError(err.message);
      else setError("Couldn't reach the server. It may be waking up, so try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel: fixed brand navy in both themes, like the logo's app tile. */}
      <aside aria-hidden className="relative hidden overflow-hidden bg-[#161b3d] p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} inverted />
          <span className="text-[1.0625rem] font-bold tracking-tight">
            Survey<span className="text-[#b9a2ff]">Builder</span>
          </span>
        </div>
        <div className="mt-auto max-w-sm">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-balance">
            Build the survey once. Watch the answers arrive.
          </p>
          <p className="mt-4 text-[#c4c6e2]">
            Conditional questions, versioned publishing and live results, in one place.
          </p>
        </div>
        <LogoMark size={340} inverted className="pointer-events-none absolute -right-24 -top-16 opacity-[0.07]" />
      </aside>

      <main id="main" className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Brand />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Admin sign in</h1>
          <p className="mt-1.5 text-muted">Manage surveys and view results.</p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} h-11`}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} h-11`}
              />
            </div>

            {error && <Alert kind="error">{error}</Alert>}

            <Button type="submit" disabled={loading} className="mt-1 h-11 w-full">
              {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted">
            <span>Accounts are created by the site owner.</span>
            <Link href="/" className="inline-flex shrink-0 items-center gap-1 rounded-lg hover:text-foreground">
              <ArrowLeft size={14} aria-hidden /> Surveys
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
