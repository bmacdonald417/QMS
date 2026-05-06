// Tests for /api/v1/cmmc row mappers + Zod contract round-trip.
// Run: node src/cmmcControls.test.js
//
// Live integration tests (mint a real token + hit the deployed endpoints
// against a tag fixture, then clean up) are gated on RUN_INTEGRATION_TESTS=1
// + INTEGRATION_TEST_QMS_URL + INTEGRATION_TEST_CLIENT_ID +
// INTEGRATION_TEST_CLIENT_SECRET. Skipped by default — local CI runs only
// the unit tests that exercise the pure mapping logic.

import { mapDocumentRow, mapCmmcDocumentRow } from './cmmcControls.js';
import {
  contractDocumentSchema,
  controlSummarySchema,
  perControlResponseSchema,
  bulkResponseSchema,
  bulkQuerySchema,
} from './lib/cmmc/governanceContractSchemas.js';
import { computeControlSummary } from './lib/cmmc/governanceContract.js';

const ORG_ID = 'test-org-id';
const NOW = new Date('2026-05-06T00:00:00Z');
const DAY = 86_400_000;

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

// ─────────────────────────────────────────────────────────────────────────────
// fixture builders — minimal Prisma-shape rows that the mappers consume
// ─────────────────────────────────────────────────────────────────────────────

function makeDocument(overrides = {}) {
  return {
    id: 'd-uuid-1',
    documentId: 'MAC-POL-001',
    title: 'Access Control Policy',
    documentType: 'POLICY',
    versionMajor: 2,
    versionMinor: 4,
    effectiveDate: new Date('2025-11-12T00:00:00Z'),
    nextReviewDate: new Date('2027-04-03T00:00:00Z'),
    status: 'EFFECTIVE',
    organizationId: ORG_ID,
    cmmcControlTags: [{ controlId: '3.1.4', coverageNote: 'Section 4.2 covers SoD' }],
    periodicReviews: [{ completedAt: new Date('2026-04-03T00:00:00Z'), status: 'COMPLETED' }],
    signatures: [
      {
        signatureMeaning: 'Approver',
        signedAt: new Date('2025-11-10T00:00:00Z'),
        signer: { firstName: 'Patrick', lastName: 'Caruso' },
      },
    ],
    assignments: [],
    ...overrides,
  };
}

function makeCmmcDocument(overrides = {}) {
  return {
    id: 'c-uuid-1',
    code: 'MAC-POL-210',
    title: 'Bundle Access Control Policy',
    kind: 'policy',
    qmsDocType: 'Controlled Document - Policy',
    reviewCadence: 'annual',
    effectiveDate: new Date('2026-01-23T00:00:00Z'),
    status: 'DRAFT',
    organizationId: ORG_ID,
    cmmcControlTags: [{ controlId: '3.1.4', coverageNote: null }],
    revisions: [{ revisionLabel: '2.0' }],
    signatures: [
      {
        signedAt: new Date('2026-01-20T00:00:00Z'),
        user: { firstName: 'Brian', lastName: 'MacDonald' },
      },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// mapDocumentRow — qms_managed source path
// ─────────────────────────────────────────────────────────────────────────────

test('mapDocumentRow: full row → contract shape passes Zod', () => {
  const row = mapDocumentRow(makeDocument(), ORG_ID, NOW);
  const r = contractDocumentSchema.parse(row);
  assertEqual(r.source, 'qms_managed');
  assertEqual(r.doc_id, 'MAC-POL-001');
  assertEqual(r.doc_uuid, 'd-uuid-1');
  assertEqual(r.doc_kind, 'policy');
  assertEqual(r.qms_doc_type, 'POLICY');
  assertEqual(r.current_version, '2.4');
  assertEqual(r.cadence_label, null);
  assertEqual(r.approval_status, 'effective');
  assertEqual(r.qms_native_status, 'EFFECTIVE');
  assertEqual(r.approver_name, 'Patrick Caruso');
  assertEqual(r.permalink, 'https://quality.mactechsolutionsllc.com/documents/by-code/MAC-POL-001');
  assertEqual(r.control_coverage_note, 'Section 4.2 covers SoD');
});

test('mapDocumentRow: APPROVED status → pending (v2.1 rollup)', () => {
  const row = mapDocumentRow(makeDocument({ status: 'APPROVED' }), ORG_ID, NOW);
  assertEqual(row.approval_status, 'pending');
  assertEqual(row.qms_native_status, 'APPROVED');
});

test('mapDocumentRow: AWAITING_APPROVAL → pending', () => {
  const row = mapDocumentRow(makeDocument({ status: 'AWAITING_APPROVAL' }), ORG_ID, NOW);
  assertEqual(row.approval_status, 'pending');
});

test('mapDocumentRow: review_cycle_status current when due far ahead', () => {
  const row = mapDocumentRow(
    makeDocument({ nextReviewDate: new Date(NOW.getTime() + 90 * DAY) }),
    ORG_ID,
    NOW
  );
  assertEqual(row.review_cycle_status, 'current');
});

test('mapDocumentRow: review_cycle_status due_soon when within 30d', () => {
  const row = mapDocumentRow(
    makeDocument({ nextReviewDate: new Date(NOW.getTime() + 15 * DAY) }),
    ORG_ID,
    NOW
  );
  assertEqual(row.review_cycle_status, 'due_soon');
});

test('mapDocumentRow: review_cycle_status overdue when past', () => {
  const row = mapDocumentRow(
    makeDocument({ nextReviewDate: new Date(NOW.getTime() - 10 * DAY) }),
    ORG_ID,
    NOW
  );
  assertEqual(row.review_cycle_status, 'overdue');
});

test('mapDocumentRow: approver fallback to APPROVAL assignment', () => {
  const row = mapDocumentRow(
    makeDocument({
      signatures: [], // no Approver signature
      assignments: [
        {
          completedAt: new Date('2026-01-01T00:00:00Z'),
          assignedTo: { firstName: 'Casey', lastName: 'Stengel' },
        },
      ],
    }),
    ORG_ID,
    NOW
  );
  assertEqual(row.approver_name, 'Casey Stengel');
});

test('mapDocumentRow: Reviewer signatureMeaning is NOT used for approver_name', () => {
  const row = mapDocumentRow(
    makeDocument({
      signatures: [
        {
          signatureMeaning: 'Reviewer',
          signedAt: new Date(),
          signer: { firstName: 'Should', lastName: 'NotMatch' },
        },
      ],
      assignments: [],
    }),
    ORG_ID,
    NOW
  );
  assertEqual(row.approver_name, null);
});

test('mapDocumentRow: organizationId mismatch throws (multi-tenant guard)', () => {
  let threw = false;
  try {
    mapDocumentRow(makeDocument({ organizationId: 'other-org' }), ORG_ID, NOW);
  } catch (err) {
    if (/organizationId mismatch/.test(err.message)) threw = true;
  }
  assert(threw, 'should throw on organizationId mismatch');
});

// ─────────────────────────────────────────────────────────────────────────────
// mapCmmcDocumentRow — cmmc_bundle source path
// ─────────────────────────────────────────────────────────────────────────────

test('mapCmmcDocumentRow: full row → contract shape passes Zod', () => {
  const row = mapCmmcDocumentRow(makeCmmcDocument(), ORG_ID, NOW);
  const r = contractDocumentSchema.parse(row);
  assertEqual(r.source, 'cmmc_bundle');
  assertEqual(r.doc_id, 'MAC-POL-210');
  assertEqual(r.doc_kind, 'policy');
  assertEqual(r.qms_doc_type, 'Controlled Document - Policy');
  assertEqual(r.current_version, '2.0');
  assertEqual(r.cadence_label, 'annual');
  assertEqual(r.last_reviewed_at, null); // bundle docs have no PeriodicReview
  assertEqual(r.approver_name, 'Brian MacDonald');
  assertEqual(r.approval_status, 'draft');
  assertEqual(r.permalink, 'https://quality.mactechsolutionsllc.com/cmmc/docs/MAC-POL-210');
});

test('mapCmmcDocumentRow: synthesizes next_review_due from cadence + effectiveDate', () => {
  const row = mapCmmcDocumentRow(
    makeCmmcDocument({
      effectiveDate: new Date('2026-01-23T00:00:00Z'),
      reviewCadence: 'annual',
    }),
    ORG_ID,
    NOW
  );
  assertEqual(row.next_review_due_at, '2027-01-23T00:00:00.000Z');
  assertEqual(row.review_cycle_status, 'current');
});

test('mapCmmcDocumentRow: null effectiveDate → next_review null + status current', () => {
  const row = mapCmmcDocumentRow(
    makeCmmcDocument({ effectiveDate: null, reviewCadence: 'annual' }),
    ORG_ID,
    NOW
  );
  assertEqual(row.next_review_due_at, null);
  assertEqual(row.review_cycle_status, 'current');
});

test('mapCmmcDocumentRow: scope kind → reference rewrite', () => {
  const row = mapCmmcDocumentRow(makeCmmcDocument({ kind: 'scope' }), ORG_ID, NOW);
  assertEqual(row.doc_kind, 'reference');
});

test('mapCmmcDocumentRow: weird kind → other fallback', () => {
  const row = mapCmmcDocumentRow(makeCmmcDocument({ kind: 'mystery' }), ORG_ID, NOW);
  assertEqual(row.doc_kind, 'other');
});

test('mapCmmcDocumentRow: no signatures → approver_name null', () => {
  const row = mapCmmcDocumentRow(makeCmmcDocument({ signatures: [] }), ORG_ID, NOW);
  assertEqual(row.approver_name, null);
});

test('mapCmmcDocumentRow: organizationId mismatch throws', () => {
  let threw = false;
  try {
    mapCmmcDocumentRow(makeCmmcDocument({ organizationId: 'other-org' }), ORG_ID, NOW);
  } catch (err) {
    if (/organizationId mismatch/.test(err.message)) threw = true;
  }
  assert(threw, 'should throw');
});

// ─────────────────────────────────────────────────────────────────────────────
// summary + envelope round-trips
// ─────────────────────────────────────────────────────────────────────────────

test('per-control envelope: zero docs → absent summary + Zod parses', () => {
  const body = {
    control_id: '3.1.4',
    documents: [],
    summary: computeControlSummary([]),
  };
  const parsed = perControlResponseSchema.parse(body);
  assertEqual(parsed.summary.control_coverage_status, 'absent');
});

test('per-control envelope: one effective+current doc → complete', () => {
  const body = {
    control_id: '3.1.4',
    documents: [mapDocumentRow(makeDocument({ status: 'EFFECTIVE' }), ORG_ID, NOW)],
    summary: computeControlSummary([
      mapDocumentRow(makeDocument({ status: 'EFFECTIVE' }), ORG_ID, NOW),
    ]),
  };
  const parsed = perControlResponseSchema.parse(body);
  assertEqual(parsed.summary.control_coverage_status, 'complete');
  assertEqual(parsed.summary.documents_present, 1);
  assertEqual(parsed.summary.documents_current, 1);
});

test('per-control envelope: one DRAFT doc → partial', () => {
  const docs = [mapDocumentRow(makeDocument({ status: 'DRAFT' }), ORG_ID, NOW)];
  const body = { control_id: '3.1.4', documents: docs, summary: computeControlSummary(docs) };
  const parsed = perControlResponseSchema.parse(body);
  assertEqual(parsed.summary.control_coverage_status, 'partial');
});

test('bulk envelope: order preserved', () => {
  const body = {
    controls: [
      { control_id: '3.6.1', summary: computeControlSummary([]) },
      { control_id: '3.1.4', summary: computeControlSummary([]) },
      { control_id: '3.2.1', summary: computeControlSummary([]) },
    ],
  };
  const parsed = bulkResponseSchema.parse(body);
  assertEqual(
    parsed.controls.map((c) => c.control_id),
    ['3.6.1', '3.1.4', '3.2.1']
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// query schema — control_ids parsing/validation
// ─────────────────────────────────────────────────────────────────────────────

test('bulkQuerySchema: parses 3-id list', () => {
  const parsed = bulkQuerySchema.parse({ control_ids: '3.1.4,3.2.1,3.6.1' });
  assertEqual(parsed.control_ids, ['3.1.4', '3.2.1', '3.6.1']);
});

test('bulkQuerySchema: trims whitespace + filters empty', () => {
  const parsed = bulkQuerySchema.parse({ control_ids: ' 3.1.4 , 3.2.1 ,, ,3.6.1 ' });
  assertEqual(parsed.control_ids, ['3.1.4', '3.2.1', '3.6.1']);
});

test('bulkQuerySchema: rejects bad format', () => {
  let threw = false;
  try {
    bulkQuerySchema.parse({ control_ids: '3.1.4,NOT-A-CONTROL' });
  } catch (err) {
    if (/invalid control id/.test(err.message)) threw = true;
  }
  assert(threw, 'should throw on invalid control id');
});

test('bulkQuerySchema: rejects when over cap (51 ids)', () => {
  const ids = Array.from({ length: 51 }, (_, i) => `3.1.${i + 1}`).join(',');
  let threw = false;
  try {
    bulkQuerySchema.parse({ control_ids: ids });
  } catch (err) {
    if (/cap is 50/.test(err.message)) threw = true;
  }
  assert(threw, 'should throw on cap exceeded');
});

test('bulkQuerySchema: accepts exactly 50 ids', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `3.1.${i + 1}`).join(',');
  const parsed = bulkQuerySchema.parse({ control_ids: ids });
  assertEqual(parsed.control_ids.length, 50);
});

// ─────────────────────────────────────────────────────────────────────────────
// summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('');
console.log(`cmmcControls.test: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, err } of failures) console.error(`  ${name}\n    ${err.stack || err.message}`);
  process.exit(1);
}
