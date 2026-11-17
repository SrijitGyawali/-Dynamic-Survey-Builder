// Survey schema contract shared by the builder, the public form and the API.
// Mirrors apps/api/internal/survey/schema.go. Keep both in sync.

export type QuestionType = "text" | "single_choice" | "multi_choice" | "rating";

export interface Option {
  id: string;
  label: string;
}

export type ConditionOperator = "equals" | "includes" | "gte" | "lte";

/** Show this question only when an EARLIER question's answer matches. */
export interface Condition {
  questionId: string;
  operator: ConditionOperator;
  value: string | number;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  required: boolean;
  options?: Option[]; // single_choice, multi_choice
  min?: number; // rating
  max?: number; // rating
  showIf?: Condition;
}

export interface SurveySchema {
  questions: Question[];
}

/** questionId -> answer. text: string, single: optionId, multi: optionId[], rating: number */
export type Answers = Record<string, string | string[] | number>;

export type SurveyStatus = "draft" | "published" | "closed";

export interface Survey {
  id: string;
  title: string;
  description: string;
  slug: string;
  status: SurveyStatus;
  draftSchema: SurveySchema;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}
