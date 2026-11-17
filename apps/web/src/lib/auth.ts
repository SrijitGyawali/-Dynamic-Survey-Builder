"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";

// The admin JWT is kept in localStorage and sent as a Bearer header.
// Trade-off: simpler than cookies when web and API are on different domains
// (Vercel + Render), but readable by JS, so XSS would expose it. The 24h
// expiry limits the damage. See the README for the reasoning.
const TOKEN_KEY = "survey_admin_token";

export interface AdminUser {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  admin: AdminUser;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode): session lasts for this page only */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function login(email: string, password: string) {
  return api<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string) {
  return api<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Loads the current admin from /api/auth/me. Redirects to /login when there
 * is no token or the token has expired.
 */
export function useAdmin() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    api<AdminUser>("/api/auth/me", { token: t })
      .then((a) => {
        setAdmin(a);
        setTokenState(t);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) clearToken();
        router.replace("/login");
      });
  }, [router]);

  const logout = () => {
    clearToken();
    router.replace("/login");
  };

  return { admin, token, logout };
}
