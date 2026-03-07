/**
 * Reviewer questionnaire definition (mirrors server/src/lib/reviewQuestions.js).
 * Used for Review Decision card UI; API validates against server definition.
 */

export const REVIEW_QUESTION_IDS = {
  FORMATTING: 'formatting',
  INCOMPLETE_ITEMS: 'incompleteItems',
  OTHER_1: 'other1',
  OTHER_2: 'other2',
  OTHER_3: 'other3',
  OTHER_4: 'other4',
  OTHER_5: 'other5',
} as const;

export interface ReviewQuestion {
  id: string;
  label: string;
  required: boolean;
}

export const REVIEW_QUESTIONS: ReviewQuestion[] = [
  {
    id: REVIEW_QUESTION_IDS.FORMATTING,
    label: 'Are there any formatting issues needing correction?',
    required: true,
  },
  {
    id: REVIEW_QUESTION_IDS.INCOMPLETE_ITEMS,
    label: 'Are there any items marked as in progress or not complete, or control not yet met?',
    required: true,
  },
  {
    id: REVIEW_QUESTION_IDS.OTHER_1,
    label: 'Are there any other issues that must be corrected before approval?',
    required: true,
  },
  {
    id: REVIEW_QUESTION_IDS.OTHER_2,
    label: 'Is the document scope and applicability clearly stated?',
    required: true,
  },
  {
    id: REVIEW_QUESTION_IDS.OTHER_3,
    label: 'Are roles and responsibilities clearly defined where required?',
    required: true,
  },
  {
    id: REVIEW_QUESTION_IDS.OTHER_4,
    label: 'Is the document consistent with referenced policies and procedures?',
    required: true,
  },
  {
    id: REVIEW_QUESTION_IDS.OTHER_5,
    label: 'Are all required sections complete and accurate?',
    required: true,
  },
];

export type ReviewAnswerValue = 'yes' | 'no';

export interface ReviewAnswerInput {
  questionId: string;
  value: ReviewAnswerValue;
  comments?: string;
}

export interface ReviewResponsesPayload {
  answers: ReviewAnswerInput[];
  requiresRevision?: boolean;
}
