import type { SurveyStatus } from "@/lib/types";

const styles: Record<SurveyStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  published: "bg-green-100 text-green-800",
  closed: "bg-amber-100 text-amber-800",
};

export function StatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}
