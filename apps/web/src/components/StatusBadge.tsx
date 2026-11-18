import type { SurveyStatus } from "@/lib/types";

// Quiet status label: a coloured dot plus text (never colour alone).
const dot: Record<SurveyStatus, string> = {
  draft: "bg-[#c7c7cc]",
  published: "bg-primary",
  closed: "bg-[#ff9f0a]",
};

export function StatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-muted">
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot[status]}`} />
      {status}
    </span>
  );
}
