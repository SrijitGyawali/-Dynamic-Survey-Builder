"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
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
    <div className="flex min-h-screen flex-col bg-subtle">
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Brand />
          </div>
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight">Admin sign in</h1>
            <p className="mt-1 text-sm text-muted">Manage surveys and view results.</p>

            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
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
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
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
                  className={inputClass}
                />
              </div>

              {error && <Alert kind="error">{error}</Alert>}

              <Button type="submit" disabled={loading} className="mt-2 w-full">
                {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            Admin accounts are created by the site owner.
          </p>
          <p className="mt-2 text-center">
            <Link href="/" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:text-foreground">
              <ArrowLeft size={14} aria-hidden /> Back to surveys
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
