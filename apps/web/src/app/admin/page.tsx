"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Alert, Button, inputClass, labelClass } from "@/components/ui";
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
      if (err instanceof ApiError && err.status === 401) setError("That email and password don’t match. Try again.");
      else if (err instanceof ApiError && err.status === 429) setError(err.message);
      else setError("Couldn’t reach the server. It may be waking up, so try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 justify-center px-5 pb-24 pt-20 sm:pt-28">
        <div className="w-full max-w-[400px]">
          <h1 className="type-title text-center">Sign in.</h1>
          <p className="mt-3 text-center text-muted">Manage surveys and see results.</p>

          <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className={labelClass}>
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
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className={labelClass}>
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

            <Button type="submit" disabled={loading} className="mt-3 w-full">
              {loading && <Loader2 size={17} className="animate-spin" aria-hidden />}
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-10 text-center text-sm text-muted">
            Admin accounts are created by the site owner.{" "}
            <Link href="/" className="rounded text-primary hover:underline">
              Back to surveys <span aria-hidden>›</span>
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
