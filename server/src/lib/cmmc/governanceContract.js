// Pure helpers for the codex CMMC governance-doc contract (v2.1).
//
// SOURCE: contract is locked in the codex repo at
// docs/specs/qms-codex-integration-handoff.md (commit 4140e7a),
// "Locked decisions" section. Any change here implies a contract revision.
//
// All functions are pure: no I/O, no Prisma, no clock dependence except
// `now` which is injected so tests are deterministic.

const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// doc_kind rollups
// ─────────────────────────────────────────────────────────────────────────────

// Document.documentType (Prisma enum) → contract doc_kind.
// Per v2.1: `record` is dropped, `plan` and `reference` are added.
const DOC_KIND_BY_TYPE = {
  POLICY: 'policy',
  SOP: 'sop',
  WORK_INSTRUCTION: 'sop',
  FORM: 'form',
  INCIDENT_RESPONSE_PLAN: 'plan',
  CONFIGURATION_MANAGEMENT_PLAN: 'plan',
  IT_SYSTEM: 'reference',
  SECURITY: 'reference',
  AUDIT_ASSESSMENT: 'reference',
  OTHER: 'other',
};

export function mapDocKind(documentType) {
  return DOC_KIND_BY_TYPE[documentType] ?? 'other';
}

// CmmcDocument.kind is a free-form string. v2.1 says lowercased pass-through
// with one rewrite (`scope → reference`) so the federated enum stays bounded.
const CMMC_KIND_REWRITES = {
  scope: 'reference',
};

const CMMC_KIND_ALLOWED = new Set([
  'policy',
  'procedure',
  'sop',
  'plan',
  'form',
  'reference',
  'other',
]);

export function mapCmmcKind(kind) {
  if (typeof kind !== 'string') return 'other';
  const lower = kind.trim().toLowerCase();
  const rewritten = CMMC_KIND_REWRITES[lower] ?? lower;
  return CMMC_KIND_ALLOWED.has(rewritten) ? rewritten : 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// approval_status rollups
// ─────────────────────────────────────────────────────────────────────────────

// Document.status → contract approval_status. APPROVED → pending is deliberate:
// CMMC adjudication only counts a doc once it's EFFECTIVE.
const DOC_APPROVAL_BY_STATUS = {
  EFFECTIVE: 'effective',
  DRAFT: 'draft',
  IN_REVIEW: 'pending',
  AWAITING_APPROVAL: 'pending',
  APPROVED: 'pending',
  PENDING_APPROVAL: 'pending',
  PENDING_QUALITY_RELEASE: 'pending',
  OBSOLETE: 'retired',
  ARCHIVED: 'retired',
};

export function mapDocApprovalStatus(status) {
  return DOC_APPROVAL_BY_STATUS[status] ?? 'draft';
}

const CMMC_APPROVAL_BY_STATUS = {
  EFFECTIVE: 'effective',
  DRAFT: 'draft',
  IN_REVIEW: 'pending',
  RETIRED: 'retired',
};

export function mapCmmcApprovalStatus(status) {
  return CMMC_APPROVAL_BY_STATUS[status] ?? 'draft';
}

// ─────────────────────────────────────────────────────────────────────────────
// review-cycle synthesis + status
// ─────────────────────────────────────────────────────────────────────────────

const CADENCE_DAYS = {
  annual: 365,
  quarterly: 90,
  monthly: 30,
};

export function cadenceInterval(cadenceLabel) {
  if (typeof cadenceLabel !== 'string') return null;
  return CADENCE_DAYS[cadenceLabel.trim().toLowerCase()] ?? null;
}

// Synthesize next_review_due for a contract row. Single rule for both sources:
//   - if next_review_due_at is set, use as-is
//   - else if cmmc_bundle has cadence_label + effectiveDate, add the interval
//   - else null
// Inputs are nullable so the caller can pass raw Prisma fields.
export function synthesizeNextReviewDue({
  source,
  nextReviewDueAt,
  cadenceLabel,
  effectiveDate,
}) {
  if (nextReviewDueAt instanceof Date && !Number.isNaN(nextReviewDueAt.getTime())) {
    return nextReviewDueAt;
  }
  if (source !== 'cmmc_bundle') return null;
  if (!(effectiveDate instanceof Date) || Number.isNaN(effectiveDate.getTime())) return null;
  const days = cadenceInterval(cadenceLabel);
  if (days == null) return null;
  return new Date(effectiveDate.getTime() + days * DAY_MS);
}

// review_cycle_status — derived from synthesized next_review_due_at.
// `now` is injected for testability; production callers pass new Date().
export function computeReviewCycleStatus(nextReviewDue, now) {
  if (!(nextReviewDue instanceof Date) || Number.isNaN(nextReviewDue.getTime())) {
    return 'current';
  }
  const t = now.getTime();
  const due = nextReviewDue.getTime();
  if (t >= due + 365 * DAY_MS) return 'expired';
  if (t >= due) return 'overdue';
  if (due <= t + 30 * DAY_MS) return 'due_soon';
  return 'current';
}

// ─────────────────────────────────────────────────────────────────────────────
// control coverage rollup
// ─────────────────────────────────────────────────────────────────────────────

// `complete` requires ≥1 doc that is BOTH effective AND review-cycle current
// or due_soon. `partial` is "tagged but nothing meets complete". `absent` is
// "no docs tagged at all". Input is the array of contract document rows that
// the endpoint is about to return for this control.
export function computeControlCoverageStatus(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return 'absent';
  const hasComplete = docs.some(
    (d) =>
      d.approval_status === 'effective' &&
      (d.review_cycle_status === 'current' || d.review_cycle_status === 'due_soon')
  );
  return hasComplete ? 'complete' : 'partial';
}

// ─────────────────────────────────────────────────────────────────────────────
// summary rollup for both endpoints
// ─────────────────────────────────────────────────────────────────────────────

export function computeControlSummary(docs) {
  const documents_present = docs.length;
  const documents_current = docs.filter(
    (d) =>
      d.approval_status === 'effective' &&
      (d.review_cycle_status === 'current' || d.review_cycle_status === 'due_soon')
  ).length;
  const documents_due_soon = docs.filter(
    (d) => d.review_cycle_status === 'due_soon'
  ).length;
  const documents_overdue = docs.filter(
    (d) => d.review_cycle_status === 'overdue' || d.review_cycle_status === 'expired'
  ).length;
  return {
    documents_present,
    documents_current,
    documents_due_soon,
    documents_overdue,
    control_coverage_status: computeControlCoverageStatus(docs),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// permalink builders (keyed off human code, never row UUID)
// ─────────────────────────────────────────────────────────────────────────────

const QMS_BASE = 'https://quality.mactechsolutionsllc.com';

export function buildQmsManagedPermalink(humanCode) {
  return `${QMS_BASE}/documents/by-code/${encodeURIComponent(humanCode)}`;
}

export function buildCmmcBundlePermalink(humanCode) {
  return `${QMS_BASE}/cmmc/docs/${encodeURIComponent(humanCode)}`;
}
