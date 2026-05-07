// Document lifecycle state machine — CMMC L2 aligned.
//
// Spec: docs/specs/document-approval-cmmc-alignment.md (codex repo).
//
// This module is the single source of truth for what gates each
// transition needs. Every approval/release endpoint routes through
// here so the gates are enforced once and the routes don't drift.
//
// Status enum (existing) maps to CMMC stages:
//   DRAFT                       — author authoring
//   IN_REVIEW                   — collecting Reviewer signatures (≥1 needed)
//   PENDING_APPROVAL            — SIA recorded, waiting for Approver
//   AWAITING_APPROVAL           — alias of PENDING_APPROVAL (legacy)
//   APPROVED                    — Approver signed, NOT yet released
//   PENDING_QUALITY_RELEASE     — equivalent to APPROVED (legacy)
//   EFFECTIVE                   — Quality Manager released; CMMC-eligible evidence
//   OBSOLETE / ARCHIVED         — superseded or retired
//
// For each transition, gateFor* returns either {ok:true} or
// {ok:false, reason:string}. Routes use the result to 409 with reason.

import { prisma } from '../db.js';

const APPROVER_RE = /^approver$|approve|release/i;
const REVIEWER_RE = /^reviewer$|^review$/i;

/** Pre-EFFECTIVE statuses that count as "has been Approver-signed". */
const APPROVED_STATUSES = new Set(['APPROVED', 'PENDING_QUALITY_RELEASE']);

/** Statuses that count as the doc being in pre-approval review. */
const REVIEW_PHASE_STATUSES = new Set([
  'DRAFT',
  'IN_REVIEW',
  'PENDING_APPROVAL',
  'AWAITING_APPROVAL',
]);

/**
 * Load a Document with everything the state-machine gates need to inspect.
 */
export async function loadDocumentForLifecycle(id) {
  return prisma.document.findUnique({
    where: { id },
    include: {
      signatures: {
        orderBy: { signedAt: 'desc' },
        select: {
          id: true,
          signerId: true,
          signatureMeaning: true,
          signedAt: true,
        },
      },
    },
  });
}

function reviewerSigners(doc) {
  return new Set(
    (doc?.signatures ?? [])
      .filter((s) => REVIEWER_RE.test(s.signatureMeaning))
      .map((s) => s.signerId),
  );
}

function approverSigners(doc) {
  return new Set(
    (doc?.signatures ?? [])
      .filter((s) => APPROVER_RE.test(s.signatureMeaning))
      .map((s) => s.signerId),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gate: a user is recording Security Impact Analysis on the doc.
 * CMMC: CM.L2-3.4.4. Separation of Duties: SIA recorder must not be
 * the author or any reviewer.
 */
export function gateForRecordSIA(doc, userId) {
  if (!doc) return { ok: false, reason: 'document not found' };
  if (!REVIEW_PHASE_STATUSES.has(doc.status)) {
    return {
      ok: false,
      reason: `SIA can only be recorded while doc is in review (current: ${doc.status})`,
    };
  }
  if (userId === doc.authorId) {
    return {
      ok: false,
      reason:
        'Separation of Duties (CMMC AC.L2-3.1.4): SIA cannot be recorded by the document author',
    };
  }
  if (reviewerSigners(doc).has(userId)) {
    return {
      ok: false,
      reason:
        'Separation of Duties (CMMC AU.L2-3.3.9): SIA cannot be recorded by a Reviewer of this document',
    };
  }
  return { ok: true };
}

/**
 * Gate: an Approver is about to sign. Used by the existing approval flow
 * before allowing the Approver signature insert. CMMC SoD: Approver ≠
 * author ≠ any reviewer ≠ SIA recorder.
 */
export function gateForApproverSign(doc, approverUserId) {
  if (!doc) return { ok: false, reason: 'document not found' };
  if (!REVIEW_PHASE_STATUSES.has(doc.status) && doc.status !== 'APPROVED') {
    return { ok: false, reason: `cannot approve while doc is in ${doc.status}` };
  }
  if (!doc.securityImpactAnalysis || !doc.securityImpactAnalysis.trim()) {
    return {
      ok: false,
      reason:
        'Security Impact Analysis required before approval (CMMC CM.L2-3.4.4)',
    };
  }
  if (approverUserId === doc.authorId) {
    return {
      ok: false,
      reason:
        'Separation of Duties (CMMC AC.L2-3.1.4): Approver cannot be the document author',
    };
  }
  if (reviewerSigners(doc).has(approverUserId)) {
    return {
      ok: false,
      reason:
        'Separation of Duties (CMMC AU.L2-3.3.9): Approver cannot also be a Reviewer of this document',
    };
  }
  if (doc.securityImpactAnalysisByUserId === approverUserId) {
    return {
      ok: false,
      reason:
        'Separation of Duties: Approver cannot be the user who recorded the Security Impact Analysis',
    };
  }
  if (reviewerSigners(doc).size === 0) {
    return {
      ok: false,
      reason: 'At least one Reviewer signature is required before approval (CMMC CM.L2-3.4.3 [b])',
    };
  }
  return { ok: true };
}

/**
 * Gate: caller is pressing the Quality Manager Release button. CMMC:
 * CM.L2-3.4.5 [d]/[h] — access restrictions enforced. The release moves
 * status to EFFECTIVE.
 *
 * Caller must already have document:release permission (route-layer
 * check). This gate is the data-side check.
 */
export function gateForRelease(doc, releaserUserId) {
  if (!doc) return { ok: false, reason: 'document not found' };
  if (!APPROVED_STATUSES.has(doc.status)) {
    return {
      ok: false,
      reason: `cannot release: status is ${doc.status}, expected APPROVED`,
    };
  }
  if (approverSigners(doc).size === 0) {
    return {
      ok: false,
      reason: 'cannot release: no Approver signature on file',
    };
  }
  if (!doc.securityImpactAnalysis || !doc.securityImpactAnalysis.trim()) {
    return {
      ok: false,
      reason: 'cannot release: Security Impact Analysis missing',
    };
  }
  if (releaserUserId === doc.authorId) {
    return {
      ok: false,
      reason:
        'Separation of Duties (CMMC AC.L2-3.1.4): release cannot be triggered by the document author',
    };
  }
  return { ok: true };
}

/**
 * Gate: any direct write to an already-EFFECTIVE document's content.
 * CMMC L2 doesn't permit silent edits to released docs — they require
 * a new revision (new Document row with supersedesDocumentId).
 */
export function gateForContentEdit(doc) {
  if (!doc) return { ok: false, reason: 'document not found' };
  if (doc.status === 'EFFECTIVE') {
    return {
      ok: false,
      reason:
        'EFFECTIVE documents are immutable; create a new revision to change content (CMMC CM.L2-3.4.1)',
    };
  }
  if (doc.status === 'OBSOLETE' || doc.status === 'ARCHIVED') {
    return {
      ok: false,
      reason: `cannot edit a ${doc.status.toLowerCase()} document`,
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// What-needs-doing-next descriptor (consumed by the WorkflowStepper UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a {step, message, requiredPermission, requiredRoles} hint for
 * the UI. Tells the user EXACTLY what's missing to get to EFFECTIVE.
 */
export function nextRequiredAction(doc) {
  if (!doc) return null;
  if (doc.status === 'EFFECTIVE') return null;
  if (doc.status === 'OBSOLETE' || doc.status === 'ARCHIVED') return null;

  if (doc.status === 'DRAFT') {
    return {
      step: 'submit_for_review',
      message: 'Submit document for review',
      requiredPermission: 'document:create',
    };
  }
  if (doc.status === 'IN_REVIEW') {
    if (reviewerSigners(doc).size === 0) {
      return {
        step: 'reviewer_signature',
        message: 'Reviewer must sign (≥1 Reviewer signature required, must not be the author)',
        requiredPermission: 'document:review',
      };
    }
    if (!doc.securityImpactAnalysis || !doc.securityImpactAnalysis.trim()) {
      return {
        step: 'security_impact_analysis',
        message:
          'Security Impact Analysis required before approval (CMMC CM.L2-3.4.4). Recorder must not be author or reviewer.',
        requiredPermission: 'document:review',
      };
    }
    return {
      step: 'submit_for_approval',
      message: 'All review signatures and SIA collected — submit for approval',
      requiredPermission: 'document:review',
    };
  }
  if (doc.status === 'PENDING_APPROVAL' || doc.status === 'AWAITING_APPROVAL') {
    if (!doc.securityImpactAnalysis || !doc.securityImpactAnalysis.trim()) {
      return {
        step: 'security_impact_analysis',
        message:
          'Security Impact Analysis required before approval (CMMC CM.L2-3.4.4)',
        requiredPermission: 'document:review',
      };
    }
    return {
      step: 'approver_signature',
      message:
        'Designated Approver must sign (must not be author, reviewer, or SIA recorder)',
      requiredPermission: 'document:approve',
    };
  }
  if (APPROVED_STATUSES.has(doc.status)) {
    return {
      step: 'release',
      message:
        'Quality Manager must release the document (CMMC CM.L2-3.4.5 enforced step)',
      requiredPermission: 'document:release',
      requiredRoles: ['Quality Manager', 'System Admin'],
    };
  }
  return null;
}

/** Surface the gate result for diagnostic display (UI tooltip on disabled actions). */
export function describeGateResult(result) {
  if (!result) return null;
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.reason };
}
