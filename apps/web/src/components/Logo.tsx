import { useId } from "react";

/**
 * Survey Builder mark, redrawn as SVG from the brand artwork: an open rounded
 * square (a form), two lines of text, and a check mark breaking out of the
 * corner. Colours follow the logo: navy outline, lavender lines, indigo→violet
 * check. The gradient lives only here, never in UI controls.
 */
export function LogoMark({ size = 32, className = "", inverted = false }: { size?: number; className?: string; inverted?: boolean }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-check`} x1="24" y1="40" x2="44" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f46e5" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      {/* Open frame: gap at the bottom-right where the check sits */}
      <path
        d="M41 22V13.5C41 9.36 37.64 6 33.5 6H13.5C9.36 6 6 9.36 6 13.5V34.5C6 38.64 9.36 42 13.5 42H24"
        stroke={inverted ? "#ffffff" : "currentColor"}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path d="M14.5 16H31.5" stroke="#9496b8" strokeWidth="4" strokeLinecap="round" />
      <path d="M14.5 25H24" stroke="#9496b8" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M29 34.5L33.5 39L43 28.5"
        stroke={`url(#${id}-check)`}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + "Survey Builder" wordmark: "Survey" in ink, "Builder" in violet. */
export function Wordmark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} className="text-foreground" />
      <span translate="no" className="text-[1.0625rem] font-bold tracking-tight">
        Survey<span className="text-accent">Builder</span>
      </span>
    </span>
  );
}
