/**
 * Tests for sspSubmissionContract.js — pure helpers, no DB.
 * Run:  node src/lib/sspSubmissionContract.test.js
 */
import { createHash } from 'node:crypto';
import {
  validateSspSubmission,
  deriveSubmissionStatusFromDocument,
} from './sspSubmissionContract.js';

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PDF_BYTES = Buffer.from('%PDF-1.4\n%fake-pdf-bytes\n%%EOF\n', 'utf8');
const PDF_B64 = PDF_BYTES.toString('base64');
const PDF_SHA = createHash('sha256').update(PDF_BYTES).digest('hex');

const PAYLOAD_HASH = 'a'.repeat(64);

const ALL_110_CONTROLS = Array.from({ length: 110 }, (_, i) => `3.${Math.floor(i / 30) + 1}.${(i % 30) + 1}`);

function makeValidPayload(overrides = {}) {
  return {
    submission_id: '00000000-0000-0000-0000-000000000001',
    organization_id: 'org-uuid',
    ssp_document_id: 'ssp-doc-uuid',
    ssp_version_number: 3,
    document_number: 'SSP-001',
    payload_sha256: PAYLOAD_HASH,
    generated_at: '2026-05-09T10:00:00Z',
    boundary_id: 'boundary-uuid',
    boundary_name: 'MacTech CUI Vault',
    bridge_version: '1',
    tally: { controls_covered: 110 },
    controls_mapped: ALL_110_CONTROLS,
    signoffs: [
      {
        kind: 'isso',
        signer_display_name: 'Patrick Caruso',
        data_hash: PAYLOAD_HASH,
        signed_at: '2026-05-09T09:00:00Z',
      },
      {
        kind: 'system_owner',
        signer_display_name: 'James Adams',
        data_hash: PAYLOAD_HASH,
        signed_at: '2026-05-09T09:10:00Z',
      },
      {
        kind: 'authorizing_official',
        signer_display_name: 'Brian MacDonald',
        data_hash: PAYLOAD_HASH,
        signed_at: '2026-05-09T09:20:00Z',
      },
    ],
    artifacts: {
      pdf_base64: PDF_B64,
      pdf_sha256: PDF_SHA,
      canonical_json: { ssp: 'payload' },
      canonical_json_sha256: PAYLOAD_HASH,
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────

function testHappyPath() {
  const result = validateSspSubmission(makeValidPayload());
  assert(result.ok === true, `happy path should pass; got ${JSON.stringify(result)}`);
  console.log('  happy path: OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 1: payload_sha256 must be 64 lowercase hex
// ─────────────────────────────────────────────────────────────────────────────

function testGate1ShortHash() {
  const r = validateSspSubmission(makeValidPayload({ payload_sha256: 'abc123' }));
  assert(!r.ok && r.errors.some((e) => e.field === 'payload_sha256'), 'short hash rejected');
  console.log('  gate 1 (short hash): OK');
}

function testGate1UppercaseHash() {
  const r = validateSspSubmission(makeValidPayload({ payload_sha256: 'A'.repeat(64) }));
  assert(!r.ok && r.errors.some((e) => e.field === 'payload_sha256'), 'uppercase hash rejected');
  console.log('  gate 1 (uppercase hash): OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 2: canonical_json_sha256 === payload_sha256
// ─────────────────────────────────────────────────────────────────────────────

function testGate2HashMismatch() {
  const p = makeValidPayload();
  p.artifacts.canonical_json_sha256 = 'b'.repeat(64);
  const r = validateSspSubmission(p);
  assert(
    !r.ok && r.errors.some((e) => e.field === 'artifacts.canonical_json_sha256'),
    'canonical hash mismatch rejected',
  );
  console.log('  gate 2 (canonical hash mismatch): OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 3: signoffs must have all three kinds
// ─────────────────────────────────────────────────────────────────────────────

function testGate3MissingAo() {
  const p = makeValidPayload();
  p.signoffs = p.signoffs.filter((s) => s.kind !== 'authorizing_official');
  const r = validateSspSubmission(p);
  assert(
    !r.ok && r.errors.some((e) => e.field.includes('authorizing_official')),
    'missing AO rejected',
  );
  console.log('  gate 3 (missing AO): OK');
}

function testGate3DuplicateKind() {
  const p = makeValidPayload();
  p.signoffs.push({ ...p.signoffs[0] }); // duplicate isso
  const r = validateSspSubmission(p);
  assert(!r.ok, 'duplicate signoff rejected');
  console.log('  gate 3 (duplicate kind): OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 4: every signoff.data_hash === payload_sha256
// ─────────────────────────────────────────────────────────────────────────────

function testGate4SignoffHashDrift() {
  const p = makeValidPayload();
  p.signoffs[1].data_hash = 'c'.repeat(64);
  const r = validateSspSubmission(p);
  assert(
    !r.ok && r.errors.some((e) => e.field.startsWith('signoffs[1].data_hash')),
    'signoff hash drift rejected',
  );
  console.log('  gate 4 (signoff hash drift): OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 5: controls_mapped >= 100
// ─────────────────────────────────────────────────────────────────────────────

function testGate5TooFewControls() {
  const r = validateSspSubmission(makeValidPayload({ controls_mapped: ['3.1.1'] }));
  assert(!r.ok && r.errors.some((e) => e.field === 'controls_mapped'), 'too few controls rejected');
  console.log('  gate 5 (too few controls): OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 6: pdf_sha256 must match sha256(decoded pdf_base64)
// ─────────────────────────────────────────────────────────────────────────────

function testGate6PdfHashMismatch() {
  const p = makeValidPayload();
  p.artifacts.pdf_sha256 = 'd'.repeat(64);
  const r = validateSspSubmission(p);
  assert(
    !r.ok && r.errors.some((e) => e.field === 'artifacts.pdf_sha256'),
    'pdf hash mismatch rejected',
  );
  console.log('  gate 6 (pdf hash mismatch): OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 7: bridge_version
// ─────────────────────────────────────────────────────────────────────────────

function testGate7UnsupportedVersion() {
  const r = validateSspSubmission(makeValidPayload({ bridge_version: '2' }));
  assert(!r.ok && r.errors.some((e) => e.field === 'bridge_version'), 'bridge_version=2 rejected');
  console.log('  gate 7 (unsupported version): OK');
}

function testGate7MissingVersionDefaultsToOne() {
  const p = makeValidPayload();
  delete p.bridge_version;
  const r = validateSspSubmission(p);
  assert(r.ok, 'missing bridge_version should default to "1" and pass');
  console.log('  gate 7 (missing version defaults to 1): OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Status derivation
// ─────────────────────────────────────────────────────────────────────────────

function testDeriveStatus() {
  assert(deriveSubmissionStatusFromDocument('DRAFT', null) === 'PENDING_REVIEW', 'DRAFT → PENDING_REVIEW');
  assert(deriveSubmissionStatusFromDocument('IN_REVIEW', null) === 'UNDER_REVIEW', 'IN_REVIEW → UNDER_REVIEW');
  assert(deriveSubmissionStatusFromDocument('AWAITING_APPROVAL', null) === 'UNDER_REVIEW', 'AWAITING_APPROVAL → UNDER_REVIEW');
  assert(deriveSubmissionStatusFromDocument('APPROVED', null) === 'APPROVED', 'APPROVED → APPROVED');
  assert(deriveSubmissionStatusFromDocument('EFFECTIVE', null) === 'QUALITY_RELEASED', 'EFFECTIVE → QUALITY_RELEASED');
  assert(deriveSubmissionStatusFromDocument('OBSOLETE', null) === 'QUALITY_RELEASED', 'OBSOLETE → QUALITY_RELEASED');
  assert(deriveSubmissionStatusFromDocument('DRAFT', new Date()) === 'REJECTED', 'rejectedAt overrides DRAFT');
  assert(deriveSubmissionStatusFromDocument('EFFECTIVE', new Date()) === 'REJECTED', 'rejectedAt overrides EFFECTIVE');
  assert(deriveSubmissionStatusFromDocument(null, null) === 'PENDING_REVIEW', 'null status defaults to PENDING_REVIEW');
  console.log('  deriveSubmissionStatusFromDocument: OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const tests = [
  testHappyPath,
  testGate1ShortHash,
  testGate1UppercaseHash,
  testGate2HashMismatch,
  testGate3MissingAo,
  testGate3DuplicateKind,
  testGate4SignoffHashDrift,
  testGate5TooFewControls,
  testGate6PdfHashMismatch,
  testGate7UnsupportedVersion,
  testGate7MissingVersionDefaultsToOne,
  testDeriveStatus,
];

console.log('sspSubmissionContract tests…');
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${t.name}: ${err.message}`);
  }
}
console.log(`\n${passed}/${tests.length} passed${failed > 0 ? `, ${failed} failed` : ''}`);
if (failed > 0) process.exit(1);
