/**
 * Pure helpers for the Codex SSP Doc Control bridge contract.
 *
 * No DB. No Express. No auth. Designed to be unit-testable in isolation and
 * imported by both the live route handler and the integration test suite.
 *
 * Contract reference: docs/CODEX_SSP_BRIDGE_PHASE2_RUNBOOK.md (and Phase 2
 * brief from Patrick).
 */

import { createHash } from 'node:crypto';

const HEX64_RE = /^[0-9a-f]{64}$/;
// Recognized signoff kinds. signoffs is now optional (0+); when present, every
// entry's data_hash must equal payload_sha256, but kind uniqueness and the
// "all three present" rule are NOT enforced — the QMS Reviewer/Approver/
// Quality Release chain is the source of truth, not this provenance array.
const ACCEPTED_SIGNOFF_KINDS = new Set(['isso', 'system_owner', 'authorizing_official']);
const SUPPORTED_BRIDGE_VERSIONS = new Set(['1']);
const MIN_CONTROLS_MAPPED = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate an inbound SSP submission payload against the seven contract gates.
 * Returns { ok: true } | { ok: false, errors: [{field, message}] }.
 *
 * Gates:
 *   1. payload_sha256 is exactly 64 lowercase hex characters
 *   2. canonical_json_sha256 === payload_sha256
 *   3. signoffs is an array (0+ entries; QMS Reviewer/Approver/Quality
 *      Release chain is the source of truth — Codex sigs, when present, are
 *      preserved as provenance only)
 *   4. every signoff (when present) has data_hash === payload_sha256 and a
 *      recognized kind
 *   5. controls_mapped.length >= 100 (sanity check; CMMC L2 covers 110)
 *   6. recompute sha256(base64-decode(pdf_base64)) === pdf_sha256
 *   7. bridge_version is "1" (or absent — defaults to "1" for backwards-compat)
 *   8. author (when present) has display_name + email; email must be
 *      well-formed; QMS "Submitted by" UI reads from this
 *
 * @param {object} parsed - JSON-parsed inbound body
 * @returns {{ok: true} | {ok: false, errors: Array<{field: string, message: string}>}}
 */
export function validateSspSubmission(parsed) {
  const errors = [];
  const push = (field, message) => errors.push({ field, message });

  if (!parsed || typeof parsed !== 'object') {
    push('body', 'Request body must be a JSON object');
    return { ok: false, errors };
  }

  // Required top-level fields (presence + basic shape; full gate logic below).
  const requiredStrings = [
    'submission_id',
    'organization_id',
    'ssp_document_id',
    'document_number',
    'payload_sha256',
    'generated_at',
    'boundary_id',
    'boundary_name',
  ];
  for (const f of requiredStrings) {
    if (typeof parsed[f] !== 'string' || parsed[f].length === 0) {
      push(f, `Required string field is missing or empty`);
    }
  }
  if (typeof parsed.ssp_version_number !== 'number' || !Number.isInteger(parsed.ssp_version_number) || parsed.ssp_version_number < 1) {
    push('ssp_version_number', 'Must be a positive integer');
  }

  // Gate 1: payload_sha256 shape
  if (typeof parsed.payload_sha256 === 'string' && !HEX64_RE.test(parsed.payload_sha256)) {
    push('payload_sha256', 'Must be exactly 64 lowercase hex characters');
  }

  // Gate 7: bridge_version
  const bridgeVersion = parsed.bridge_version ?? '1';
  if (!SUPPORTED_BRIDGE_VERSIONS.has(String(bridgeVersion))) {
    push(
      'bridge_version',
      `Unsupported bridge version: ${bridgeVersion}. Supported: ${[...SUPPORTED_BRIDGE_VERSIONS].join(', ')}`,
    );
  }

  // Gate 2: canonical_json_sha256 === payload_sha256
  if (!parsed.artifacts || typeof parsed.artifacts !== 'object') {
    push('artifacts', 'Required object missing');
  } else {
    const a = parsed.artifacts;
    if (typeof a.canonical_json_sha256 !== 'string' || !HEX64_RE.test(a.canonical_json_sha256)) {
      push('artifacts.canonical_json_sha256', 'Must be exactly 64 lowercase hex characters');
    } else if (a.canonical_json_sha256 !== parsed.payload_sha256) {
      push('artifacts.canonical_json_sha256', 'Must equal payload_sha256');
    }
    if (a.canonical_json === undefined || a.canonical_json === null) {
      push('artifacts.canonical_json', 'Required field missing');
    }
    if (typeof a.pdf_base64 !== 'string' || a.pdf_base64.length === 0) {
      push('artifacts.pdf_base64', 'Required base64-encoded PDF missing');
    }
    if (typeof a.pdf_sha256 !== 'string' || !HEX64_RE.test(a.pdf_sha256)) {
      push('artifacts.pdf_sha256', 'Must be exactly 64 lowercase hex characters');
    }
    // Gate 6: pdf hash
    if (typeof a.pdf_base64 === 'string' && typeof a.pdf_sha256 === 'string' && HEX64_RE.test(a.pdf_sha256)) {
      try {
        const buf = Buffer.from(a.pdf_base64, 'base64');
        const computed = createHash('sha256').update(buf).digest('hex');
        if (computed !== a.pdf_sha256) {
          push('artifacts.pdf_sha256', 'Does not match sha256 of decoded pdf_base64');
        }
      } catch {
        push('artifacts.pdf_base64', 'Failed to decode as base64');
      }
    }
  }

  // Gates 3 + 4: signoffs (0+; per-entry validation when present)
  if (!Array.isArray(parsed.signoffs)) {
    push('signoffs', 'Must be an array (may be empty)');
  } else {
    parsed.signoffs.forEach((s, i) => {
      if (!s || typeof s !== 'object') {
        push(`signoffs[${i}]`, 'Must be an object');
        return;
      }
      if (typeof s.kind !== 'string' || !ACCEPTED_SIGNOFF_KINDS.has(s.kind)) {
        push(
          `signoffs[${i}].kind`,
          `Unrecognized kind. Accepted: ${[...ACCEPTED_SIGNOFF_KINDS].join(', ')}`,
        );
      }
      if (typeof s.data_hash !== 'string' || !HEX64_RE.test(s.data_hash)) {
        push(`signoffs[${i}].data_hash`, 'Must be exactly 64 lowercase hex characters');
      } else if (s.data_hash !== parsed.payload_sha256) {
        push(`signoffs[${i}].data_hash`, 'Must equal payload_sha256');
      }
      if (typeof s.signer_display_name !== 'string' || s.signer_display_name.length === 0) {
        push(`signoffs[${i}].signer_display_name`, 'Required string field missing');
      }
      if (typeof s.signed_at !== 'string') {
        push(`signoffs[${i}].signed_at`, 'Required ISO timestamp string missing');
      }
    });
  }

  // Gate 8: author (optional). When present, both display_name and email
  // are required. QMS surfaces these in the External Submissions admin UI.
  if (parsed.author !== undefined && parsed.author !== null) {
    if (typeof parsed.author !== 'object' || Array.isArray(parsed.author)) {
      push('author', 'Must be an object when present');
    } else {
      if (typeof parsed.author.display_name !== 'string' || parsed.author.display_name.trim().length === 0) {
        push('author.display_name', 'Required string field missing');
      }
      if (typeof parsed.author.email !== 'string' || !EMAIL_RE.test(parsed.author.email)) {
        push('author.email', 'Must be a well-formed email address');
      }
    }
  }

  // Gate 5: controls_mapped >= 100
  if (!Array.isArray(parsed.controls_mapped)) {
    push('controls_mapped', 'Must be an array');
  } else if (parsed.controls_mapped.length < MIN_CONTROLS_MAPPED) {
    push(
      'controls_mapped',
      `Must contain at least ${MIN_CONTROLS_MAPPED} entries; received ${parsed.controls_mapped.length}`,
    );
  } else if (!parsed.controls_mapped.every((c) => typeof c === 'string')) {
    push('controls_mapped', 'All entries must be strings');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

/**
 * Map QMS Document.status + persisted rejection state onto the public
 * ExternalSubmissionStatus enum surfaced to operators / Codex.
 *
 * Single source of truth: the linked Document drives the status, with REJECTED
 * as the only persisted terminal that doesn't follow Document.status.
 *
 * @param {string|null} documentStatus - Prisma Document.status value
 * @param {Date|string|null} rejectedAt - submission row rejected_at (truthy = rejected)
 * @returns {'PENDING_REVIEW'|'UNDER_REVIEW'|'APPROVED'|'QUALITY_RELEASED'|'REJECTED'}
 */
export function deriveSubmissionStatusFromDocument(documentStatus, rejectedAt) {
  if (rejectedAt) return 'REJECTED';
  switch (documentStatus) {
    case 'DRAFT':
      return 'PENDING_REVIEW';
    case 'IN_REVIEW':
    case 'AWAITING_APPROVAL':
    case 'PENDING_APPROVAL':
    case 'PENDING_QUALITY_RELEASE':
      return 'UNDER_REVIEW';
    case 'APPROVED':
      return 'APPROVED';
    case 'EFFECTIVE':
    case 'OBSOLETE':
    case 'ARCHIVED':
      // Once-released. OBSOLETE/ARCHIVED are terminal-after-release states; the
      // doc was quality-released at some point in its history, which is what
      // Codex Phase 3 cares about.
      return 'QUALITY_RELEASED';
    default:
      return 'PENDING_REVIEW';
  }
}

export const __test_internals = {
  HEX64_RE,
  ACCEPTED_SIGNOFF_KINDS,
  SUPPORTED_BRIDGE_VERSIONS,
  MIN_CONTROLS_MAPPED,
  EMAIL_RE,
};
