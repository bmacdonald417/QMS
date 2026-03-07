/**
 * Reviewer questionnaire definition.
 * Used by API validation and can be exposed to frontend via GET endpoint or shared copy.
 * Fixed questions (2) + up to 5 other pertinent questions.
 */

export const REVIEW_QUESTION_IDS = {
  FORMATTING: 'formatting',
  INCOMPLETE_ITEMS: 'incompleteItems',
  OTHER_1: 'other1',
  OTHER_2: 'other2',
  OTHER_3: 'other3',
  OTHER_4: 'other4',
  OTHER_5: 'other5',
};

/** All question definitions in display order */
export const REVIEW_QUESTIONS = [
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

/** Set of all question IDs for validation */
export const REVIEW_QUESTION_IDS_SET = new Set(REVIEW_QUESTIONS.map((q) => q.id));

/**
 * Valid answer values for each question (yes = needs correction / issue; no = no issue).
 */
export const VALID_ANSWER_VALUES = ['yes', 'no'];

/**
 * Validate reviewResponses payload and return { valid, error, answersMap, requiresRevision }.
 * @param {unknown} reviewResponses - Request body reviewResponses
 * @returns {{ valid: boolean, error?: string, answersMap?: Map<string, { value: string, comments?: string }>, requiresRevision?: boolean }}
 */
export function validateReviewResponses(reviewResponses) {
  if (!reviewResponses || typeof reviewResponses !== 'object') {
    return { valid: false, error: 'reviewResponses is required and must be an object' };
  }
  const { answers } = reviewResponses;
  if (!Array.isArray(answers)) {
    return { valid: false, error: 'reviewResponses.answers must be an array' };
  }
  const answersByKey = new Map();
  for (const a of answers) {
    if (!a || typeof a !== 'object' || !a.questionId || typeof a.questionId !== 'string') {
      return { valid: false, error: 'Each answer must have a questionId' };
    }
    if (!REVIEW_QUESTION_IDS_SET.has(a.questionId)) {
      return { valid: false, error: `Unknown questionId: ${a.questionId}` };
    }
    const value = typeof a.value === 'string' ? a.value.trim().toLowerCase() : '';
    if (!VALID_ANSWER_VALUES.includes(value)) {
      return { valid: false, error: `Answer for ${a.questionId} must be "yes" or "no"` };
    }
    answersByKey.set(a.questionId, {
      value,
      comments: typeof a.comments === 'string' ? a.comments.trim() : undefined,
    });
  }
  for (const q of REVIEW_QUESTIONS) {
    if (!answersByKey.has(q.id)) {
      return { valid: false, error: `Missing answer for question: ${q.id}` };
    }
  }
  const requiresRevision = [...answersByKey.values()].some((a) => a.value === 'yes');
  return {
    valid: true,
    answersMap: answersByKey,
    requiresRevision,
  };
}
