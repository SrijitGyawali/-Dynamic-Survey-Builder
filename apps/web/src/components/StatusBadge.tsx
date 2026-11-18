import type { SurveyStatus } from "@/lib/types";

// Status always has a text label (never colour alone).
const styles: Record<SurveyStatus, { cls: string; dot: string }> = {
  draft: { cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  published: { cls: "bg-primary-soft text-primary-hover", dot: "bg-primary" },
  closed: { cls: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
};

export function StatusBadge({ status }: { status: SurveyStatus }) {
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${s.cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
