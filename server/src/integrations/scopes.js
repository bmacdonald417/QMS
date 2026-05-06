/**
 * Integration scope catalog. Used for token minting and authorization.
 */

export const SCOPES = {
  FORMRECORDS_READ: 'formrecords:read',
  FORMRECORDS_WRITE: 'formrecords:write',
  TRAINING_READ: 'training:read',
  GOVERNANCE_READ: 'governance:read',
  GOVERNANCE_WRITE: 'governance:write',
  CMMC_READ: 'cmmc:read',
};

/** All valid scope strings. */
export const VALID_SCOPES = Object.values(SCOPES);

/** Scopes required for read-only training access. */
export const TRAINING_READ_SCOPES = [SCOPES.TRAINING_READ];

/** Scopes required for form records read. */
export const FORMRECORDS_READ_SCOPES = [SCOPES.FORMRECORDS_READ];

/** Scopes required for form records write. */
export const FORMRECORDS_WRITE_SCOPES = [SCOPES.FORMRECORDS_READ, SCOPES.FORMRECORDS_WRITE];

/** Scopes required for governance read. */
export const GOVERNANCE_READ_SCOPES = [SCOPES.GOVERNANCE_READ];

/** Scopes required for governance write. */
export const GOVERNANCE_WRITE_SCOPES = [SCOPES.GOVERNANCE_READ, SCOPES.GOVERNANCE_WRITE];

/** Scopes required for the codex CMMC contract (per-control + bulk endpoints). */
export const CMMC_READ_SCOPES = [SCOPES.CMMC_READ];

/**
 * Check if the given scopes array includes all required scopes.
 * @param {string[]} granted - Scopes from token
 * @param {string[]} required - Scopes required for the operation
 */
export function hasScopes(granted, required) {
  if (!Array.isArray(granted) || !Array.isArray(required)) return false;
  const set = new Set(granted);
  return required.every((s) => set.has(s));
}
