// Small shared UI primitives. Everything uses design tokens from globals.css.

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-out-expo active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-card hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-foreground hover:border-faint hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-foreground",
  danger: "border border-danger/25 bg-surface text-danger hover:bg-danger-soft",
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
      className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition-[background-color,color,transform] duration-200 ease-out-expo active:scale-95 disabled:pointer-events-none disabled:opacity-30 ${
        tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-muted hover:bg-subtle hover:text-foreground"
      } ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-border bg-surface shadow-card ${className}`}>{children}</div>;
}

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-danger/25 bg-danger-soft text-danger",
    success: "border-primary/25 bg-primary-soft text-accent",
    info: "border-border bg-subtle text-muted",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-track ${className}`} />;
}

export const inputClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-foreground placeholder:text-faint transition-[border-color,box-shadow] duration-200 ease-out-expo hover:border-faint focus-visible:border-primary sm:text-sm aria-[invalid=true]:border-danger";
