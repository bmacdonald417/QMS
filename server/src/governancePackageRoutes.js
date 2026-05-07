/**
 * Determinate MacTech Vault Governance Package — read-only API.
 *
 * Surfaces the canonical (immutable) governance package version(s) so the
 * /system/governance-package UI page can render the roster every CMMC
 * vault carries. NO write endpoints — versions are published exclusively
 * via the CLI seed script (server/scripts/seedGovernancePackageVersion.js)
 * with break-glass --force semantics for over-writes.
 */
import express from 'express';
import { prisma } from './db.js';
import { authMiddleware } from './auth.js';
import {
  gateForRelease,
  nextRequiredAction,
} from './lib/documentLifecycle.js';

const router = express.Router();

router.use(authMiddleware);

// Canonical CMMC-group document types — must match the filter in
// server/scripts/seedGovernancePackageVersion.js and the type roster in
// server/src/lib/buildQmsGovernanceManifest.js. If you grow the set in
// either, grow it here too.
const CMMC_GROUP_DOCUMENT_TYPES = [
  'POLICY',
  'SOP',
  'WORK_INSTRUCTION',
  'INCIDENT_RESPONSE_PLAN',
  'CONFIGURATION_MANAGEMENT_PLAN',
  'IT_SYSTEM',
  'SECURITY',
  'AUDIT_ASSESSMENT',
];

const APPROVER_RE = /^approver$|approve|release/i;
const REVIEWER_RE = /^reviewer$|^review$/i;

/** GET /current — the active version's full envelope + metadata. */
router.get('/current', async (req, res) => {
  try {
    const row = await prisma.governancePackageVersion.findFirst({
      where: { isActive: true },
      orderBy: { publishedAt: 'desc' },
    });
    if (!row) return res.json({ version: null });
    res.json({ version: row });
  } catch (err) {
    console.error('governance-package /current error:', err);
    res.status(500).json({ error: 'Failed to load current package version' });
  }
});

/** GET /versions — chronological list of all published versions (metadata only). */
router.get('/versions', async (req, res) => {
  try {
    const rows = await prisma.governancePackageVersion.findMany({
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        versionLabel: true,
        publishedAt: true,
        publishedBy: true,
        contentHash: true,
        docCount: true,
        controlsTouched: true,
        isActive: true,
        notes: true,
      },
    });
    res.json({ versions: rows });
  } catch (err) {
    console.error('governance-package /versions error:', err);
    res.status(500).json({ error: 'Failed to load package versions' });
  }
});

/**
 * GET /release-readiness — scan every CMMC-group document and report
 * release-readiness state + the exact blockers (with CMMC refs) needed
 * to push it into EFFECTIVE.
 *
 * Powers the SystemReleaseReadiness page. The "ready / blocked / next
 * action" semantics mirror the per-doc gates in
 * server/src/lib/documentLifecycle.js — this is just the bulk view.
 */
router.get('/release-readiness', async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      where: {
        documentType: { in: CMMC_GROUP_DOCUMENT_TYPES },
      },
      select: {
        id: true,
        documentId: true,
        title: true,
        documentType: true,
        status: true,
        authorId: true,
        author: { select: { firstName: true, lastName: true, email: true } },
        versionMajor: true,
        versionMinor: true,
        effectiveDate: true,
        releasedAt: true,
        releasedByUserId: true,
        securityImpactAnalysis: true,
        securityImpactAnalysisAt: true,
        securityImpactAnalysisByUserId: true,
        signatures: {
          select: { signerId: true, signatureMeaning: true, signedAt: true },
          orderBy: { signedAt: 'desc' },
        },
        updatedAt: true,
      },
      orderBy: [{ documentType: 'asc' }, { documentId: 'asc' }],
    });

    const rows = docs.map((d) => {
      const reviewerCount = d.signatures.filter((s) =>
        REVIEWER_RE.test(s.signatureMeaning),
      ).length;
      const approverCount = d.signatures.filter((s) =>
        APPROVER_RE.test(s.signatureMeaning),
      ).length;
      const hasSIA = Boolean(d.securityImpactAnalysis?.trim());

      // Compute a single human-readable blockers list per doc. These
      // map 1:1 to CMMC L2 assessment objectives so the auditor can
      // see exactly what's missing without leaving this page.
      const blockers = [];
      const status = d.status;

      if (status === 'OBSOLETE' || status === 'ARCHIVED') {
        // Not a blocker per se — surfaced separately as obsolete.
      } else if (status === 'EFFECTIVE') {
        // Released — nothing to do.
      } else {
        if (reviewerCount === 0) {
          blockers.push(
            'No Reviewer signature on file — at least one required (CMMC CM.L2-3.4.3 [b]).',
          );
        }
        if (!hasSIA) {
          blockers.push(
            'Security Impact Analysis not recorded (CMMC CM.L2-3.4.4). Recorder must not be the author or any reviewer.',
          );
        }
        if (approverCount === 0) {
          blockers.push(
            'No Approver signature on file (CMMC CM.L2-3.4.3 [c]). Approver must not be author, reviewer, or SIA recorder.',
          );
        }
        if (status === 'APPROVED' || status === 'PENDING_QUALITY_RELEASE') {
          // Only the Quality Manager release click is missing.
          blockers.push(
            'Awaiting Quality Manager release (CMMC CM.L2-3.4.5). Releaser must not be the document author.',
          );
        }
      }

      // Re-run the canonical gate the API uses so the caller sees
      // exactly what their own user would hit if they clicked release
      // right now.
      const docForGate = {
        ...d,
        signatures: d.signatures.map((s) => ({
          id: '',
          signerId: s.signerId,
          signatureMeaning: s.signatureMeaning,
          signedAt: s.signedAt,
        })),
      };
      const releaseGate = gateForRelease(docForGate, req.user?.id ?? '');
      const next = nextRequiredAction(docForGate);

      let readinessLabel;
      if (status === 'EFFECTIVE') readinessLabel = 'effective';
      else if (status === 'OBSOLETE' || status === 'ARCHIVED') readinessLabel = 'obsolete';
      else if (releaseGate.ok) readinessLabel = 'ready';
      else if (
        reviewerCount === 0 &&
        approverCount === 0 &&
        !hasSIA &&
        status === 'DRAFT'
      )
        readinessLabel = 'draft_blocked';
      else readinessLabel = 'in_progress';

      return {
        id: d.id,
        documentId: d.documentId,
        title: d.title,
        documentType: d.documentType,
        version: `${d.versionMajor}.${d.versionMinor}`,
        status,
        author: d.author
          ? `${d.author.firstName ?? ''} ${d.author.lastName ?? ''}`.trim() || d.author.email
          : null,
        authorId: d.authorId,
        effectiveDate: d.effectiveDate,
        releasedAt: d.releasedAt,
        hasSIA,
        siaRecordedAt: d.securityImpactAnalysisAt,
        reviewerSignerCount: reviewerCount,
        approverSignerCount: approverCount,
        nextRequiredAction: next,
        blockers,
        releaseReadyForCaller: releaseGate.ok,
        releaseGateReason: releaseGate.ok ? null : releaseGate.reason,
        readinessLabel,
        updatedAt: d.updatedAt,
      };
    });

    const summary = {
      total: rows.length,
      effective: rows.filter((r) => r.readinessLabel === 'effective').length,
      ready: rows.filter((r) => r.readinessLabel === 'ready').length,
      in_progress: rows.filter((r) => r.readinessLabel === 'in_progress').length,
      draft_blocked: rows.filter((r) => r.readinessLabel === 'draft_blocked').length,
      obsolete: rows.filter((r) => r.readinessLabel === 'obsolete').length,
      missing_sia: rows.filter(
        (r) => !r.hasSIA && !['effective', 'obsolete'].includes(r.readinessLabel),
      ).length,
      missing_reviewer: rows.filter(
        (r) =>
          r.reviewerSignerCount === 0 && !['effective', 'obsolete'].includes(r.readinessLabel),
      ).length,
      missing_approver: rows.filter(
        (r) =>
          r.approverSignerCount === 0 && !['effective', 'obsolete'].includes(r.readinessLabel),
      ).length,
    };

    res.json({ summary, rows });
  } catch (err) {
    console.error('governance-package /release-readiness error:', err);
    res.status(500).json({ error: 'Failed to compute release readiness' });
  }
});

/** GET /v/:label — full envelope for a specific version. */
router.get('/v/:label', async (req, res) => {
  try {
    const row = await prisma.governancePackageVersion.findUnique({
      where: { versionLabel: String(req.params.label) },
    });
    if (!row) return res.status(404).json({ error: 'version not found' });
    res.json({ version: row });
  } catch (err) {
    console.error('governance-package /v/:label error:', err);
    res.status(500).json({ error: 'Failed to load package version' });
  }
});

export default router;
