// /api/v1/cmmc — codex CMMC contract endpoints (Phase 4).
//
// Per-control: GET /controls/:controlId/documents → full doc rows + summary.
// Bulk:        GET /controls/documents?control_ids=… → summaries only, max 50.
//
// Both gated on `cmmc:read` integration scope. Federate two doc sources:
// `Document` (qms_managed) and `CmmcDocument` (cmmc_bundle). Field shapes,
// rollups, and synthesis rules are locked to the v2.1 contract — see
// docs/specs/qms-codex-integration-handoff.md on the codex repo.

import express from 'express';
import { prisma } from './db.js';
import {
  getIntegrationTokenFromRequest,
  verifyIntegrationToken,
} from './integrations/auth.js';
import { SCOPES } from './integrations/scopes.js';
import { getMacTechOrgId } from './lib/orgScope.js';
import {
  mapDocKind,
  mapCmmcKind,
  mapDocApprovalStatus,
  mapCmmcApprovalStatus,
  synthesizeNextReviewDue,
  computeReviewCycleStatus,
  computeControlSummary,
  buildQmsManagedPermalink,
  buildCmmcBundlePermalink,
} from './lib/cmmc/governanceContract.js';
import {
  perControlResponseSchema,
  bulkResponseSchema,
  bulkQuerySchema,
  controlIdParamSchema,
} from './lib/cmmc/governanceContractSchemas.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// integration-only auth (no JWT fallback)
// ─────────────────────────────────────────────────────────────────────────────

// `requireIntegrationScope` in integrations/auth.js delegates to next() when
// no token is present, expecting JWT to handle. The codex contract is purely
// machine-to-machine, so missing-token is a hard 401 here.
function requireIntegrationOnlyScope(scope) {
  return (req, res, next) => {
    const token = getIntegrationTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Integration token required' });
    }
    const decoded = verifyIntegrationToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired integration token' });
    }
    if (!decoded.scp.includes(scope)) {
      return res.status(403).json({ error: `Missing integration scope: ${scope}` });
    }
    req.integration = {
      clientId: decoded.cid,
      scopes: decoded.scp,
      onBehalfOfUserId: decoded.obo,
    };
    return next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// row mappers (DB → contract)
// ─────────────────────────────────────────────────────────────────────────────

const APPROVER_SIGNATURE_RE = /^approver$|approve|release/i;

function fullName(user) {
  if (!user) return null;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name.length > 0 ? name : null;
}

export function mapDocumentRow(d, orgId, now) {
  // Belt-and-suspenders multi-tenant guard — cheap per-row check that throws
  // 500 if Prisma ever returns a row from a different tenant. With the
  // single-tenant filter in the query, this should be unreachable.
  if (d.organizationId !== orgId) {
    throw new Error(
      `organizationId mismatch on Document ${d.id}: expected ${orgId}, got ${d.organizationId}`
    );
  }

  // approver_name: latest signature whose signatureMeaning indicates approval
  // (canonical literal in prod is "Approver"; the regex tolerates near-misses).
  // Fallback: latest completed APPROVAL DocumentAssignment.
  let approverName = null;
  for (const sig of d.signatures ?? []) {
    if (APPROVER_SIGNATURE_RE.test(sig.signatureMeaning)) {
      approverName = fullName(sig.signer);
      if (approverName) break;
    }
  }
  if (!approverName) {
    const a = (d.assignments ?? [])[0];
    if (a) approverName = fullName(a.assignedTo);
  }

  const lastReview = (d.periodicReviews ?? [])[0]?.completedAt ?? null;

  // qms_managed has no cadence_label and uses Document.nextReviewDate as the
  // explicit due date. synthesizeNextReviewDue passes through when present.
  const nextReviewDue = synthesizeNextReviewDue({
    source: 'qms_managed',
    nextReviewDueAt: d.nextReviewDate,
    cadenceLabel: null,
    effectiveDate: d.effectiveDate,
  });

  const tag = (d.cmmcControlTags ?? [])[0] ?? null;

  return {
    doc_id: d.documentId,
    doc_uuid: d.id,
    source: 'qms_managed',
    title: d.title,
    doc_kind: mapDocKind(d.documentType),
    qms_doc_type: d.documentType,
    current_version: `${d.versionMajor}.${d.versionMinor}`,
    current_version_effective_date: d.effectiveDate ? d.effectiveDate.toISOString() : null,
    last_reviewed_at: lastReview ? lastReview.toISOString() : null,
    next_review_due_at: nextReviewDue ? nextReviewDue.toISOString() : null,
    cadence_label: null,
    review_cycle_status: computeReviewCycleStatus(nextReviewDue, now),
    approver_name: approverName,
    approval_status: mapDocApprovalStatus(d.status),
    qms_native_status: d.status,
    permalink: buildQmsManagedPermalink(d.documentId),
    control_coverage_note: tag?.coverageNote ?? null,
  };
}

export function mapCmmcDocumentRow(c, orgId, now) {
  if (c.organizationId !== orgId) {
    throw new Error(
      `organizationId mismatch on CmmcDocument ${c.id}: expected ${orgId}, got ${c.organizationId}`
    );
  }

  const sig = (c.signatures ?? [])[0] ?? null;
  const approverName = sig ? fullName(sig.user) : null;

  const latestRevision = (c.revisions ?? [])[0] ?? null;

  const nextReviewDue = synthesizeNextReviewDue({
    source: 'cmmc_bundle',
    nextReviewDueAt: null,
    cadenceLabel: c.reviewCadence,
    effectiveDate: c.effectiveDate,
  });

  const tag = (c.cmmcControlTags ?? [])[0] ?? null;

  return {
    doc_id: c.code,
    doc_uuid: c.id,
    source: 'cmmc_bundle',
    title: c.title,
    doc_kind: mapCmmcKind(c.kind),
    qms_doc_type: c.qmsDocType,
    current_version: latestRevision?.revisionLabel ?? null,
    current_version_effective_date: c.effectiveDate ? c.effectiveDate.toISOString() : null,
    last_reviewed_at: null, // bundle docs have no PeriodicReview cadence
    next_review_due_at: nextReviewDue ? nextReviewDue.toISOString() : null,
    cadence_label: c.reviewCadence ?? null,
    review_cycle_status: computeReviewCycleStatus(nextReviewDue, now),
    approver_name: approverName,
    approval_status: mapCmmcApprovalStatus(c.status),
    qms_native_status: c.status,
    permalink: buildCmmcBundlePermalink(c.code),
    control_coverage_note: tag?.coverageNote ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// federation: one DB query per source for an arbitrary set of control_ids
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDocsForControls(controlIds) {
  const orgId = getMacTechOrgId();
  const now = new Date();

  // qms_managed
  const docs = await prisma.document.findMany({
    where: {
      organizationId: orgId,
      cmmcControlTags: { some: { controlId: { in: controlIds } } },
    },
    include: {
      cmmcControlTags: { where: { controlId: { in: controlIds } } },
      periodicReviews: {
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 1,
      },
      signatures: {
        orderBy: { signedAt: 'desc' },
        include: {
          signer: { select: { firstName: true, lastName: true } },
        },
      },
      assignments: {
        where: { assignmentType: 'APPROVAL', status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 1,
        include: {
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  // cmmc_bundle
  const cmmcDocs = await prisma.cmmcDocument.findMany({
    where: {
      organizationId: orgId,
      cmmcControlTags: { some: { controlId: { in: controlIds } } },
    },
    include: {
      cmmcControlTags: { where: { controlId: { in: controlIds } } },
      revisions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      signatures: {
        where: { role: 'APPROVER' },
        orderBy: { signedAt: 'desc' },
        take: 1,
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  // Group rows under each control_id they're tagged with. A doc tagged
  // against three controls fans out into three entries here so the per-
  // control view shows the same doc with the appropriate coverage_note.
  const byControl = new Map(controlIds.map((id) => [id, []]));

  for (const d of docs) {
    for (const tag of d.cmmcControlTags ?? []) {
      const bucket = byControl.get(tag.controlId);
      if (!bucket) continue;
      const docWithThisTag = { ...d, cmmcControlTags: [tag] };
      bucket.push(mapDocumentRow(docWithThisTag, orgId, now));
    }
  }
  for (const c of cmmcDocs) {
    for (const tag of c.cmmcControlTags ?? []) {
      const bucket = byControl.get(tag.controlId);
      if (!bucket) continue;
      const docWithThisTag = { ...c, cmmcControlTags: [tag] };
      bucket.push(mapCmmcDocumentRow(docWithThisTag, orgId, now));
    }
  }

  return byControl;
}

// ─────────────────────────────────────────────────────────────────────────────
// handlers
// ─────────────────────────────────────────────────────────────────────────────

router.use(requireIntegrationOnlyScope(SCOPES.CMMC_READ));

router.get('/controls/:controlId/documents', async (req, res) => {
  const parsed = controlIdParamSchema.safeParse(req.params.controlId);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid controlId format', details: parsed.error.format() });
  }
  const controlId = parsed.data;

  try {
    const byControl = await fetchDocsForControls([controlId]);
    const documents = byControl.get(controlId) ?? [];
    const body = {
      control_id: controlId,
      documents,
      summary: computeControlSummary(documents),
    };

    // Outbound contract guard. Schema-validate the response we're about to
    // return — if a mapper drift produces a malformed shape, fail with 500
    // here rather than ship bad data to codex.
    const validated = perControlResponseSchema.safeParse(body);
    if (!validated.success) {
      console.error('Per-control response schema mismatch:', validated.error.format());
      return res.status(500).json({ error: 'Internal contract validation error' });
    }

    res.set('Cache-Control', 'no-store');
    res.json(validated.data);
  } catch (err) {
    console.error('Per-control documents fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch documents for control' });
  }
});

router.get('/controls/documents', async (req, res) => {
  const parsed = bulkQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.format() });
  }
  const controlIds = parsed.data.control_ids;

  try {
    const byControl = await fetchDocsForControls(controlIds);
    const body = {
      // Order matches request (spec: "Order matches request").
      controls: controlIds.map((id) => ({
        control_id: id,
        summary: computeControlSummary(byControl.get(id) ?? []),
      })),
    };

    const validated = bulkResponseSchema.safeParse(body);
    if (!validated.success) {
      console.error('Bulk response schema mismatch:', validated.error.format());
      return res.status(500).json({ error: 'Internal contract validation error' });
    }

    res.set('Cache-Control', 'no-store');
    res.json(validated.data);
  } catch (err) {
    console.error('Bulk documents fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch bulk control summaries' });
  }
});

export default router;
