// Small shared UI primitives. Everything uses design tokens from globals.css.

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-foreground hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-foreground",
  danger: "border border-red-200 bg-surface text-danger hover:bg-danger-soft",
};

// sm keeps a 36px height; md is 40px. Icon-only buttons use `iconButton`.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
});

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Square icon button with an accessible name and a 40px hit area. */
export function IconButton({
  label,
  className = "",
  tone = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 disabled:pointer-events-none disabled:opacity-30 ${
        tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-muted hover:bg-subtle hover:text-foreground"
      } ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-lg border border-border bg-surface ${className}`}>{children}</div>;
}

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-danger-soft text-danger",
    success: "border-teal-200 bg-primary-soft text-primary-hover",
    info: "border-border bg-subtle text-muted",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export const inputClass =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground placeholder:text-slate-400 transition-colors duration-150 hover:border-slate-400 sm:text-sm aria-[invalid=true]:border-danger";
