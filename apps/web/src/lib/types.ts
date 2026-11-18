// Survey schema contract shared by the builder, the public form and the API.
// Mirrors apps/api/internal/survey/schema.go. Keep both in sync.

export type QuestionType = "text" | "single_choice" | "multi_choice" | "rating";

export interface Option {
  id: string;
  label: string;
}

export type ConditionOperator = "equals" | "includes" | "gte" | "lte";

/**
 * Show this question only when an EARLIER question's answer matches.
 * single_choice -> "equals" optionId, multi_choice -> "includes" optionId,
 * rating -> "equals" | "gte" | "lte" number. Text questions can't be referenced.
 */
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
  /** Show on the public homepage when published. */
  listed: boolean;
  /** Present on single-survey responses, omitted in the list view. */
  draftSchema?: SurveySchema;
  /** Published version number, null if never published. */
  currentVersion: number | null;
  /** Draft differs from the published version. */
  hasUnpublishedChanges: boolean;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyVersion {
  version: number;
  questionCount: number;
  createdAt: string;
}
