import { api } from "./api";
import type { Answers, SurveySchema } from "./types";

// Public (no auth) endpoints used by the respondent form.

export interface PublicSurvey {
  title: string;
  description: string;
  slug: string;
  version: number;
  schema: SurveySchema;
}

/** A homepage card: published surveys the admin chose to list. */
export interface ListedSurvey {
  title: string;
  description: string;
  slug: string;
  questionCount: number;
  publishedAt: string;
}

export const listPublicSurveys = () => api<ListedSurvey[]>("/api/public/surveys", { cache: "no-store" });

export const getPublicSurvey = (slug: string) =>
  api<PublicSurvey>(`/api/public/surveys/${encodeURIComponent(slug)}`, { cache: "no-store" });

export const submitResponse = (slug: string, version: number, answers: Answers, website: string) =>
  api<{ id: string }>(`/api/public/surveys/${encodeURIComponent(slug)}/responses`, {
    method: "POST",
    body: JSON.stringify({ version, answers, website }),
  });
