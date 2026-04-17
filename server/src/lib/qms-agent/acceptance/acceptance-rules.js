/** @typedef {'HIGH' | 'MEDIUM' | 'LOW'} AcceptancePriority */
/** @typedef {'MANUAL' | 'AUTOMATED' | 'DB_REVIEW' | 'UI_REVIEW' | 'API_REVIEW'} VerificationType */
/** @typedef {'MODULE' | 'TEMPLATE' | 'TASK' | 'SCHEMA' | 'WORKFLOW'} CriterionSource */

export const ACCEPTANCE_CATEGORIES = [
  'functional',
  'ui_ux',
  'permissions_security',
  'auditability',
  'workflow_behavior',
  'notifications',
  'training_linkage',
  'schema_data_integrity',
  'reporting_traceability',
  'regression_protection',
];

/** @type {Record<string, { verificationType: VerificationType; defaultPriority: AcceptancePriority }>} */
export const CATEGORY_DEFAULTS = {
  functional: { verificationType: 'MANUAL', defaultPriority: 'HIGH' },
  ui_ux: { verificationType: 'UI_REVIEW', defaultPriority: 'MEDIUM' },
  permissions_security: { verificationType: 'API_REVIEW', defaultPriority: 'HIGH' },
  auditability: { verificationType: 'DB_REVIEW', defaultPriority: 'HIGH' },
  workflow_behavior: { verificationType: 'MANUAL', defaultPriority: 'HIGH' },
  notifications: { verificationType: 'MANUAL', defaultPriority: 'MEDIUM' },
  training_linkage: { verificationType: 'MANUAL', defaultPriority: 'MEDIUM' },
  schema_data_integrity: { verificationType: 'DB_REVIEW', defaultPriority: 'HIGH' },
  reporting_traceability: { verificationType: 'MANUAL', defaultPriority: 'MEDIUM' },
  regression_protection: { verificationType: 'AUTOMATED', defaultPriority: 'HIGH' },
};

/**
 * @param {string} category
 * @param {number} index
 */
export function makeCriterionId(category, index) {
  const safe = String(category || 'general').replace(/[^a-z0-9_]+/gi, '-').toLowerCase();
  return `ac-${safe}-${index + 1}`;
}

/**
 * @param {string} text
 */
export function textStrength(text) {
  const t = (text || '').trim();
  if (t.length >= 400) return 1;
  if (t.length >= 120) return 0.75;
  if (t.length >= 40) return 0.5;
  return 0.25;
}
