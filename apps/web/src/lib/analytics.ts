import { api } from "./api";
import type { QuestionType, SurveyStatus } from "./types";

export interface OptionStat {
  id: string;
  label: string;
  count: number;
}

export interface RatingStat {
  min: number;
  max: number;
  average: number | null;
  distribution: { value: number; count: number }[];
}

export interface TextAnswer {
  responseId: string;
  answer: string;
  submittedAt: string;
}

export interface QuestionStats {
  id: string;
  title: string;
  type: QuestionType;
  required: boolean;
  conditional: boolean;
  answered: number;
  options?: OptionStat[];
  rating?: RatingStat;
  text?: { latest: TextAnswer[] };
}

export interface Analytics {
  surveyId: string;
  title: string;
  status: SurveyStatus;
  version: number | null;
  currentVersion: number | null;
  totalResponses: number;
  lastResponseAt: string | null;
  byVersion: { version: number; count: number }[];
  daily: { date: string; count: number }[];
  questions: QuestionStats[];
}

/** Votes for options removed in a later version are grouped under this id. */
export const REMOVED_OPTIONS_ID = "__removed__";

export const getAnalytics = (token: string, id: string, version: number | null) =>
  api<Analytics>(`/api/surveys/${id}/analytics${version ? `?version=${version}` : ""}`, { token });

export const getTextAnswers = (
  token: string,
  id: string,
  questionId: string,
  opts: { version: number | null; cursor?: string | null; limit?: number },
) => {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.version) q.set("version", String(opts.version));
  if (opts.cursor) q.set("cursor", opts.cursor);
  return api<{ answers: TextAnswer[]; nextCursor: string | null }>(
    `/api/surveys/${id}/analytics/questions/${encodeURIComponent(questionId)}/answers?${q}`,
    { token },
  );
};

// ---- formatting ----

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

export function timeAgo(iso: string, now = Date.now()): string {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  }
  return "just now";
}
