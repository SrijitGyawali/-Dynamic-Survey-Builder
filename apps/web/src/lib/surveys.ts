import { api } from "./api";
import type { Survey, SurveySchema, SurveyVersion } from "./types";

// Typed wrappers for the admin survey endpoints. All require the admin JWT.

export const listSurveys = (token: string) => api<Survey[]>("/api/surveys", { token });

export const getSurvey = (token: string, id: string) =>
  api<Survey>(`/api/surveys/${id}`, { token });

export const createSurvey = (token: string, title: string, description: string) =>
  api<Survey>("/api/surveys", {
    method: "POST",
    token,
    body: JSON.stringify({ title, description }),
  });

export const updateSurvey = (
  token: string,
  id: string,
  data: { title: string; description: string; draftSchema: SurveySchema },
) => api<Survey>(`/api/surveys/${id}`, { method: "PUT", token, body: JSON.stringify(data) });

export const deleteSurvey = (token: string, id: string) =>
  api<void>(`/api/surveys/${id}`, { method: "DELETE", token });

export const publishSurvey = (token: string, id: string) =>
  api<Survey>(`/api/surveys/${id}/publish`, { method: "POST", token });

export const closeSurvey = (token: string, id: string) =>
  api<Survey>(`/api/surveys/${id}/close`, { method: "POST", token });

export const listVersions = (token: string, id: string) =>
  api<SurveyVersion[]>(`/api/surveys/${id}/versions`, { token });
