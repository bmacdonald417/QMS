/** @type {Record<string, string[]>} */
const ALLOWED_TRANSITIONS = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['SENT_TO_DEV', 'CANCELLED'],
  SENT_TO_DEV: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * @param {string} from
 * @param {string} to
 */
export function assertExecutionPackageStatusTransition(from, to) {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error(`Illegal package status transition: ${from} -> ${to}`);
    err.code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }
}
