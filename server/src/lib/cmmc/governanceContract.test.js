// Unit tests for the v2.1 contract pure helpers.
// Run: node src/lib/cmmc/governanceContract.test.js
//
// Style mirrors training.test.js: hand-rolled `assert(cond, msg)` and a
// numbered list of test functions called from main(). No vitest/jest in
// this repo.

import {
  mapDocKind,
  mapCmmcKind,
  mapDocApprovalStatus,
  mapCmmcApprovalStatus,
  cadenceInterval,
  synthesizeNextReviewDue,
  computeReviewCycleStatus,
  computeControlCoverageStatus,
  computeControlSummary,
  buildQmsManagedPermalink,
  buildCmmcBundlePermalink,
} from './governanceContract.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, got ${a}`);
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  FAIL ${name}: ${err.message}`);
  }
}

const DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// mapDocKind
// ─────────────────────────────────────────────────────────────────────────────

test('mapDocKind: POLICY → policy', () => {
  assertEqual(mapDocKind('POLICY'), 'policy');
});

test('mapDocKind: SOP and WORK_INSTRUCTION both → sop', () => {
  assertEqual(mapDocKind('SOP'), 'sop');
  assertEqual(mapDocKind('WORK_INSTRUCTION'), 'sop');
});

test('mapDocKind: FORM → form', () => {
  assertEqual(mapDocKind('FORM'), 'form');
});

test('mapDocKind: INCIDENT_RESPONSE_PLAN and CONFIGURATION_MANAGEMENT_PLAN → plan', () => {
  assertEqual(mapDocKind('INCIDENT_RESPONSE_PLAN'), 'plan');
  assertEqual(mapDocKind('CONFIGURATION_MANAGEMENT_PLAN'), 'plan');
});

test('mapDocKind: IT_SYSTEM, SECURITY, AUDIT_ASSESSMENT → reference', () => {
  assertEqual(mapDocKind('IT_SYSTEM'), 'reference');
  assertEqual(mapDocKind('SECURITY'), 'reference');
  assertEqual(mapDocKind('AUDIT_ASSESSMENT'), 'reference');
});

test('mapDocKind: OTHER → other; unknown → other', () => {
  assertEqual(mapDocKind('OTHER'), 'other');
  assertEqual(mapDocKind('NEW_FUTURE_TYPE'), 'other');
  assertEqual(mapDocKind(undefined), 'other');
});

// ─────────────────────────────────────────────────────────────────────────────
// mapCmmcKind
// ─────────────────────────────────────────────────────────────────────────────

test('mapCmmcKind: lowercased pass-through for known kinds', () => {
  assertEqual(mapCmmcKind('Policy'), 'policy');
  assertEqual(mapCmmcKind('PROCEDURE'), 'procedure');
  assertEqual(mapCmmcKind('plan'), 'plan');
});

test('mapCmmcKind: scope → reference', () => {
  assertEqual(mapCmmcKind('Scope'), 'reference');
  assertEqual(mapCmmcKind('SCOPE'), 'reference');
});

test('mapCmmcKind: unknown → other', () => {
  assertEqual(mapCmmcKind('weirdo'), 'other');
  assertEqual(mapCmmcKind(null), 'other');
  assertEqual(mapCmmcKind(42), 'other');
});

// ─────────────────────────────────────────────────────────────────────────────
// approval status
// ─────────────────────────────────────────────────────────────────────────────

test('mapDocApprovalStatus: EFFECTIVE → effective', () => {
  assertEqual(mapDocApprovalStatus('EFFECTIVE'), 'effective');
});

test('mapDocApprovalStatus: APPROVED → pending (deliberate per v2.1)', () => {
  assertEqual(mapDocApprovalStatus('APPROVED'), 'pending');
});

test('mapDocApprovalStatus: all in-flight statuses → pending', () => {
  for (const s of [
    'IN_REVIEW',
    'AWAITING_APPROVAL',
    'PENDING_APPROVAL',
    'PENDING_QUALITY_RELEASE',
  ]) {
    assertEqual(mapDocApprovalStatus(s), 'pending', `for ${s}`);
  }
});

test('mapDocApprovalStatus: OBSOLETE and ARCHIVED → retired', () => {
  assertEqual(mapDocApprovalStatus('OBSOLETE'), 'retired');
  assertEqual(mapDocApprovalStatus('ARCHIVED'), 'retired');
});

test('mapDocApprovalStatus: DRAFT → draft; unknown → draft', () => {
  assertEqual(mapDocApprovalStatus('DRAFT'), 'draft');
  assertEqual(mapDocApprovalStatus('NEW_STATUS'), 'draft');
});

test('mapCmmcApprovalStatus: full mapping', () => {
  assertEqual(mapCmmcApprovalStatus('EFFECTIVE'), 'effective');
  assertEqual(mapCmmcApprovalStatus('DRAFT'), 'draft');
  assertEqual(mapCmmcApprovalStatus('IN_REVIEW'), 'pending');
  assertEqual(mapCmmcApprovalStatus('RETIRED'), 'retired');
  assertEqual(mapCmmcApprovalStatus('UNKNOWN'), 'draft');
});

// ─────────────────────────────────────────────────────────────────────────────
// cadence + synthesis
// ─────────────────────────────────────────────────────────────────────────────

test('cadenceInterval: known labels', () => {
  assertEqual(cadenceInterval('annual'), 365);
  assertEqual(cadenceInterval('Annual'), 365);
  assertEqual(cadenceInterval('quarterly'), 90);
  assertEqual(cadenceInterval('monthly'), 30);
});

test('cadenceInterval: unknown / null → null', () => {
  assertEqual(cadenceInterval(null), null);
  assertEqual(cadenceInterval('biennial'), null);
  assertEqual(cadenceInterval(''), null);
});

test('synthesizeNextReviewDue: explicit nextReviewDueAt wins regardless of source', () => {
  const due = new Date('2027-01-15T00:00:00Z');
  const out = synthesizeNextReviewDue({
    source: 'qms_managed',
    nextReviewDueAt: due,
    cadenceLabel: 'annual',
    effectiveDate: new Date('2025-01-15T00:00:00Z'),
  });
  assert(out instanceof Date && out.getTime() === due.getTime(), 'should pass through');
});

test('synthesizeNextReviewDue: qms_managed without explicit due → null', () => {
  const out = synthesizeNextReviewDue({
    source: 'qms_managed',
    nextReviewDueAt: null,
    cadenceLabel: 'annual',
    effectiveDate: new Date('2025-01-15T00:00:00Z'),
  });
  assertEqual(out, null);
});

test('synthesizeNextReviewDue: cmmc_bundle with cadence + effective date → effective + interval', () => {
  const eff = new Date('2025-01-15T00:00:00Z');
  const out = synthesizeNextReviewDue({
    source: 'cmmc_bundle',
    nextReviewDueAt: null,
    cadenceLabel: 'annual',
    effectiveDate: eff,
  });
  assert(out instanceof Date, 'expected Date');
  assertEqual(out.getTime(), eff.getTime() + 365 * DAY);
});

test('synthesizeNextReviewDue: cmmc_bundle without effective date → null', () => {
  const out = synthesizeNextReviewDue({
    source: 'cmmc_bundle',
    nextReviewDueAt: null,
    cadenceLabel: 'annual',
    effectiveDate: null,
  });
  assertEqual(out, null);
});

test('synthesizeNextReviewDue: cmmc_bundle with unknown cadence → null', () => {
  const out = synthesizeNextReviewDue({
    source: 'cmmc_bundle',
    nextReviewDueAt: null,
    cadenceLabel: 'biennial',
    effectiveDate: new Date('2025-01-15T00:00:00Z'),
  });
  assertEqual(out, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// review_cycle_status
// ─────────────────────────────────────────────────────────────────────────────

test('computeReviewCycleStatus: null due → current (no cadence on file degrades to current)', () => {
  assertEqual(computeReviewCycleStatus(null, new Date('2026-05-06T00:00:00Z')), 'current');
});

test('computeReviewCycleStatus: due far in future → current', () => {
  const now = new Date('2026-05-06T00:00:00Z');
  const due = new Date(now.getTime() + 90 * DAY);
  assertEqual(computeReviewCycleStatus(due, now), 'current');
});

test('computeReviewCycleStatus: due within 30d → due_soon', () => {
  const now = new Date('2026-05-06T00:00:00Z');
  const due = new Date(now.getTime() + 15 * DAY);
  assertEqual(computeReviewCycleStatus(due, now), 'due_soon');
});

test('computeReviewCycleStatus: due exactly at boundary (30d) → due_soon', () => {
  const now = new Date('2026-05-06T00:00:00Z');
  const due = new Date(now.getTime() + 30 * DAY);
  assertEqual(computeReviewCycleStatus(due, now), 'due_soon');
});

test('computeReviewCycleStatus: due passed → overdue', () => {
  const now = new Date('2026-05-06T00:00:00Z');
  const due = new Date(now.getTime() - 5 * DAY);
  assertEqual(computeReviewCycleStatus(due, now), 'overdue');
});

test('computeReviewCycleStatus: due passed by >365d → expired', () => {
  const now = new Date('2026-05-06T00:00:00Z');
  const due = new Date(now.getTime() - 400 * DAY);
  assertEqual(computeReviewCycleStatus(due, now), 'expired');
});

test('computeReviewCycleStatus: exactly 365d past → expired (boundary inclusive)', () => {
  const now = new Date('2026-05-06T00:00:00Z');
  const due = new Date(now.getTime() - 365 * DAY);
  assertEqual(computeReviewCycleStatus(due, now), 'expired');
});

// ─────────────────────────────────────────────────────────────────────────────
// coverage status
// ─────────────────────────────────────────────────────────────────────────────

test('computeControlCoverageStatus: empty → absent', () => {
  assertEqual(computeControlCoverageStatus([]), 'absent');
  assertEqual(computeControlCoverageStatus(undefined), 'absent');
});

test('computeControlCoverageStatus: ≥1 effective + current → complete', () => {
  const docs = [
    { approval_status: 'effective', review_cycle_status: 'current' },
    { approval_status: 'draft', review_cycle_status: 'current' },
  ];
  assertEqual(computeControlCoverageStatus(docs), 'complete');
});

test('computeControlCoverageStatus: effective + due_soon counts as complete', () => {
  const docs = [{ approval_status: 'effective', review_cycle_status: 'due_soon' }];
  assertEqual(computeControlCoverageStatus(docs), 'complete');
});

test('computeControlCoverageStatus: effective + overdue → partial', () => {
  const docs = [{ approval_status: 'effective', review_cycle_status: 'overdue' }];
  assertEqual(computeControlCoverageStatus(docs), 'partial');
});

test('computeControlCoverageStatus: only pending docs → partial', () => {
  const docs = [{ approval_status: 'pending', review_cycle_status: 'current' }];
  assertEqual(computeControlCoverageStatus(docs), 'partial');
});

// ─────────────────────────────────────────────────────────────────────────────
// summary rollup
// ─────────────────────────────────────────────────────────────────────────────

test('computeControlSummary: representative mixed bag', () => {
  const docs = [
    { approval_status: 'effective', review_cycle_status: 'current' },
    { approval_status: 'effective', review_cycle_status: 'due_soon' },
    { approval_status: 'effective', review_cycle_status: 'overdue' },
    { approval_status: 'pending', review_cycle_status: 'current' },
    { approval_status: 'effective', review_cycle_status: 'expired' },
  ];
  assertEqual(computeControlSummary(docs), {
    documents_present: 5,
    documents_current: 2,
    documents_due_soon: 1,
    documents_overdue: 2,
    control_coverage_status: 'complete',
  });
});

test('computeControlSummary: empty → absent w/ zero counts', () => {
  assertEqual(computeControlSummary([]), {
    documents_present: 0,
    documents_current: 0,
    documents_due_soon: 0,
    documents_overdue: 0,
    control_coverage_status: 'absent',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// permalinks
// ─────────────────────────────────────────────────────────────────────────────

test('buildQmsManagedPermalink: keys off human code', () => {
  assertEqual(
    buildQmsManagedPermalink('MAC-POL-210'),
    'https://quality.mactechsolutionsllc.com/documents/by-code/MAC-POL-210'
  );
});

test('buildQmsManagedPermalink: encodes weird codes', () => {
  assertEqual(
    buildQmsManagedPermalink('MAC POL 210'),
    'https://quality.mactechsolutionsllc.com/documents/by-code/MAC%20POL%20210'
  );
});

test('buildCmmcBundlePermalink: keys off code field', () => {
  assertEqual(
    buildCmmcBundlePermalink('MAC-BUNDLE-001'),
    'https://quality.mactechsolutionsllc.com/cmmc/docs/MAC-BUNDLE-001'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('');
console.log(`governanceContract.test: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, err } of failures) console.error(`  ${name}\n    ${err.stack || err.message}`);
  process.exit(1);
}
