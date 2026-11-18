// Shared UI primitives. Everything uses design tokens from globals.css.
// Shape rules: pill for actions, 18px for cards, 12px for form controls.
// No shadows: hierarchy comes from type, spacing and surface colour.

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "press inline-flex items-center justify-center gap-1.5 rounded-full font-normal whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 disabled:pointer-events-none disabled:opacity-40 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-primary text-primary hover:bg-primary-soft",
  ghost: "text-primary hover:bg-primary-soft",
  danger: "border border-danger/40 text-danger hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-[17px]",
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

/** Text link with a trailing chevron, e.g. "Start survey ›". */
export function ChevronLink({ className = "", children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link className={`inline-flex items-center gap-1 rounded text-primary hover:underline ${className}`} {...props}>
      {children}
      <span aria-hidden>›</span>
    </Link>
  );
}

/** Round icon button with an accessible name and a 40px hit area. */
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
      className={`press inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 disabled:pointer-events-none disabled:opacity-30 ${
        tone === "danger" ? "text-muted hover:bg-danger-soft hover:text-danger" : "text-muted hover:bg-subtle hover:text-foreground"
      } ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-[var(--radius-card)] border border-border bg-surface ${className}`}>{children}</div>;
}

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "bg-danger-soft text-danger",
    success: "bg-primary-soft text-foreground",
    info: "bg-subtle text-muted",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-subtle ${className}`} />;
}

export const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-4 text-[17px] text-foreground placeholder:text-muted/70 transition-colors duration-150 hover:border-muted/50 aria-[invalid=true]:border-danger";

export const labelClass = "text-sm font-semibold text-foreground";
