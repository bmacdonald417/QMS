/**
 * Codex SSP Doc Control bridge — inbound receiver.
 *
 *   POST /api/external-submissions/ssp
 *
 * Verifies Bearer + HMAC (shared secrets w/ Codex), validates the 7 contract
 * gates, dedupes on (organization_id, ssp_document_id, payload_sha256), and on
 * acceptance:
 *   - persists the inbound PDF to disk + creates a FileAsset
 *   - creates a Document in DRAFT (authored by the codex-bridge bot user)
 *   - creates the ExternalDocumentSubmission staging row linking the two
 *   - seeds DocumentCmmcControlTag rows for every controls_mapped[] entry so
 *     the manifest export's resolveControlsFor() picks them up via junctions
 *   - links the prior SSP-001 submission via supersededBySubmissionId when a
 *     prior version exists in QMS
 *
 * Contract reference: docs/CODEX_SSP_BRIDGE_PHASE2_RUNBOOK.md.
 *
 * Phase 5 (list/detail/reject) lives in the same router below the bridge
 * route since they share entity space; auth differs (those routes use the
 * standard QMS user JWT + System Admin role).
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from './db.js';
import { authMiddleware, requireRoles } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';
import { inboundBridgeAuth } from './lib/inboundBridgeAuth.js';
import {
  validateSspSubmission,
  deriveSubmissionStatusFromDocument,
} from './lib/sspSubmissionContract.js';
import { getMacTechOrgId } from './lib/orgScope.js';

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const EXT_SUBMISSIONS_DIR = path.join(UPLOAD_DIR, 'external-submissions');
const BOT_EMAIL = 'codex-bridge@mactechsolutionsllc.com';

if (!fs.existsSync(EXT_SUBMISSIONS_DIR)) {
  fs.mkdirSync(EXT_SUBMISSIONS_DIR, { recursive: true });
}

/** Resolve the codex-bridge bot user's id. Cached after first lookup. */
let cachedBotUserId = null;
async function getCodexBridgeUserId() {
  if (cachedBotUserId) return cachedBotUserId;
  // Allow env override to skip the email lookup entirely.
  if (process.env.CODEX_BRIDGE_USER_ID) {
    cachedBotUserId = process.env.CODEX_BRIDGE_USER_ID;
    return cachedBotUserId;
  }
  const user = await prisma.user.findUnique({
    where: { email: BOT_EMAIL },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `Codex bridge bot user (${BOT_EMAIL}) not found. Run server/scripts/seedCodexBridgeUser.js.`,
    );
  }
  cachedBotUserId = user.id;
  return cachedBotUserId;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /ssp — bridge endpoint. NO user JWT auth; HMAC-only.
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/ssp',
  // Raw bytes only on this route — HMAC must be computed over what the sender
  // signed. The 20mb cap accommodates multi-page SSP PDFs base64-encoded.
  express.raw({ type: 'application/json', limit: '20mb' }),
  inboundBridgeAuth({
    tokenEnv: 'SSP_BRIDGE_TOKEN',
    hmacEnv: 'SSP_BRIDGE_HMAC',
  }),
  async (req, res) => {
    const parsed = req.parsedJson;

    // Contract gates 1–7
    const validation = validateSspSubmission(parsed);
    if (!validation.ok) {
      return res
        .status(400)
        .json({ error: 'invalid_payload', details: validation.errors });
    }

    const orgId = getMacTechOrgId();
    const botUserId = await getCodexBridgeUserId();

    // Idempotency: same (org, ext_doc, sha256) → return existing.
    // Prisma generates the compound-unique-key argument from concatenated
    // field names (externalOrganizationId_externalDocumentId_payloadSha256)
    // — the @@unique's `map:` only renames the DB constraint, not the
    // client-side key. Found by reading prod logs after every POST 502'd
    // with an unhandled PrismaClientValidationError ("Unknown argument
    // external_submission_idempotency. Available: externalOrganizationId_…").
    const existing = await prisma.externalDocumentSubmission.findUnique({
      where: {
        externalOrganizationId_externalDocumentId_payloadSha256: {
          externalOrganizationId: parsed.organization_id,
          externalDocumentId: parsed.ssp_document_id,
          payloadSha256: parsed.payload_sha256,
        },
      },
      include: { qmsDocument: { select: { documentId: true } } },
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        qms_submission_id: existing.id,
        qms_document_number: existing.documentNumber,
        expected_release_path: 'Reviewer → Approver → Quality Release',
        review_window_days_estimate: 5,
        idempotent_replay: true,
      });
    }

    // Conflict detection: a submission with the same document_number already
    // exists with a different payload_sha256 AND it's still mid-flight (not
    // QUALITY_RELEASED, not REJECTED). The vN→vN+1 supersession case is fine
    // — that's handled below by linking supersededBySubmissionId.
    const blockingSubmission = await prisma.externalDocumentSubmission.findFirst({
      where: {
        documentNumber: parsed.document_number,
        payloadSha256: { not: parsed.payload_sha256 },
        supersededBySubmissionId: null,
        status: { in: ['PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED'] },
      },
      select: { id: true, payloadSha256: true, status: true },
    });
    if (blockingSubmission) {
      return res.status(409).json({
        error: 'conflict',
        message:
          `A submission for ${parsed.document_number} is already in flight ` +
          `(status=${blockingSubmission.status}) with a different payload_sha256. ` +
          `Wait for it to release or reject before submitting a new version.`,
        in_flight_submission_id: blockingSubmission.id,
      });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Persist the PDF to disk and create a FileAsset.
        const pdfBuf = Buffer.from(parsed.artifacts.pdf_base64, 'base64');
        const submissionId = randomUUID();
        const storageKey = `external-submissions/codex-ssp-${submissionId}.pdf`;
        const diskPath = path.join(UPLOAD_DIR, storageKey);
        fs.writeFileSync(diskPath, pdfBuf);

        const fileAsset = await tx.fileAsset.create({
          data: {
            storageKey,
            filename: `${parsed.document_number}-v${parsed.ssp_version_number}.pdf`,
            contentType: 'application/pdf',
            sizeBytes: pdfBuf.length,
            sha256: parsed.artifacts.pdf_sha256,
            uploadedById: botUserId,
          },
        });

        // 2. Determine the next versionMajor for this documentNumber.
        const prior = await tx.document.findFirst({
          where: { documentId: parsed.document_number, organizationId: orgId },
          orderBy: [{ versionMajor: 'desc' }, { versionMinor: 'desc' }],
          select: { id: true, versionMajor: true },
        });
        const versionMajor = prior
          ? Math.max(prior.versionMajor + 1, parsed.ssp_version_number)
          : parsed.ssp_version_number;

        // 3. Create the QMS Document in DRAFT. Authored by the bot, awaiting
        //    a human Reviewer pickup. The body content is a stub pointer to
        //    the PDF + canonical_json on the staging row — the QMS Document
        //    is a controlled-record wrapper, not a body store for the SSP.
        const stubContent = [
          `# System Security Plan — ${parsed.boundary_name}`,
          ``,
          `**Source:** Trust Codex (https://codex.mactechsolutionsllc.com)  `,
          `**Submission:** \`${parsed.submission_id}\`  `,
          `**Codex SSP version:** ${parsed.ssp_version_number}  `,
          `**Generated at:** ${parsed.generated_at}  `,
          `**Payload SHA-256:** \`${parsed.payload_sha256}\``,
          ``,
          `This document is the QMS-controlled record wrapper for an SSP authored in Trust Codex.`,
          `The authoritative content is the PDF artifact attached to this Document; the full canonical`,
          `JSON payload (including all 110 control determinations) is preserved on the linked external`,
          `submission row for audit.`,
          ``,
          `## Codex sign-offs (provenance — preserved as evidence)`,
          ``,
          ...parsed.signoffs.map(
            (s) => `- **${s.kind}** — ${s.signer_display_name} on ${s.signed_at}`,
          ),
          ``,
          `## QMS release chain`,
          ``,
          `This document will move through QMS's standard Reviewer → Approver → Quality Release flow.`,
          `When released, the next governance manifest export will surface it to Codex with`,
          `\`document_type='ssp'\` and \`document_number='${parsed.document_number}'\` so the Codex linker`,
          `can match it back to submission \`${parsed.submission_id}\`.`,
        ].join('\n');

        const document = await tx.document.create({
          data: {
            documentId: parsed.document_number,
            title: `System Security Plan — ${parsed.boundary_name}`,
            documentType: 'SSP',
            versionMajor,
            versionMinor: 0,
            status: 'DRAFT',
            content: stubContent,
            authorId: botUserId,
            organizationId: orgId,
            supersedesDocumentId: prior?.id ?? null,
            tags: ['CMMC-2.0', 'EXTERNAL_SUBMISSION'],
          },
        });

        // 4. Stage row.
        const submission = await tx.externalDocumentSubmission.create({
          data: {
            id: submissionId,
            externalSystem: 'codex',
            inboundBridgeVersion: String(parsed.bridge_version ?? '1'),
            externalSubmissionId: parsed.submission_id,
            externalOrganizationId: parsed.organization_id,
            externalDocumentId: parsed.ssp_document_id,
            externalVersionNumber: parsed.ssp_version_number,
            documentNumber: parsed.document_number,
            documentType: 'SSP',
            payloadSha256: parsed.payload_sha256,
            payloadJson: parsed,
            pdfFileAssetId: fileAsset.id,
            controlsMapped: parsed.controls_mapped,
            qmsDocumentId: document.id,
            status: 'PENDING_REVIEW',
          },
        });

        // 5. FileLink the PDF to the Document so /api/files endpoints serve it.
        await tx.fileLink.create({
          data: {
            fileAssetId: fileAsset.id,
            entityType: 'Document',
            entityId: document.id,
            purpose: 'EXTERNAL_SSP_SUBMISSION_PDF',
          },
        });

        // 6. Seed DocumentCmmcControlTag rows so the manifest export's
        //    resolveControlsFor() junction-first lookup populates
        //    controls_mapped on the released entry.
        if (parsed.controls_mapped.length > 0) {
          await tx.documentCmmcControlTag.createMany({
            data: parsed.controls_mapped.map((controlId) => ({
              documentId: document.id,
              controlId,
              coverageNote: 'Auto-tagged from Codex SSP submission',
            })),
            skipDuplicates: true,
          });
        }

        // 7. Mark prior staging row as superseded by this one.
        if (prior) {
          const priorSubmission = await tx.externalDocumentSubmission.findFirst({
            where: { qmsDocumentId: prior.id },
            select: { id: true },
          });
          if (priorSubmission) {
            await tx.externalDocumentSubmission.update({
              where: { id: priorSubmission.id },
              data: { supersededBySubmissionId: submission.id },
            });
          }
        }

        // 8. Audit trail. Bridge actor, not a user.
        await tx.auditLog.create({
          data: {
            actorType: 'INTEGRATION',
            actorId: 'codex-ssp-bridge',
            action: 'EXTERNAL_SSP_SUBMISSION_RECEIVED',
            entityType: 'ExternalDocumentSubmission',
            entityId: submission.id,
            afterValue: {
              externalSubmissionId: parsed.submission_id,
              documentNumber: parsed.document_number,
              externalVersionNumber: parsed.ssp_version_number,
              payloadSha256: parsed.payload_sha256,
              qmsDocumentId: document.id,
              controlsMappedCount: parsed.controls_mapped.length,
            },
            ip: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
            requestId: req.requestId || null,
          },
        });

        return { submission, document };
      });

      return res.status(202).json({
        ok: true,
        qms_submission_id: result.submission.id,
        qms_document_number: result.document.documentId,
        expected_release_path: 'Reviewer → Approver → Quality Release',
        review_window_days_estimate: 5,
      });
    } catch (err) {
      console.error('[external-ssp] internal error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to persist submission. The submission was not accepted.',
      });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — admin-facing list/detail/reject. JSON-parsed body. User JWT.
// Mounted on the same router; the JSON body parser only applies to handlers
// AFTER this point. The bridge POST above is unaffected (it has its own
// express.raw mounted route-locally).
// ─────────────────────────────────────────────────────────────────────────────

const adminBody = express.json({ limit: '500kb' });

/** GET /api/external-submissions — list, System Admin only */
router.get(
  '/',
  authMiddleware,
  requireRoles('System Admin', 'Admin', 'System Administrator'),
  async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : null;
      const where = {};
      if (status && ['PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'QUALITY_RELEASED', 'REJECTED'].includes(status)) {
        // Persisted-status filter only matches PENDING_REVIEW (initial) and REJECTED reliably.
        // UNDER_REVIEW/APPROVED/QUALITY_RELEASED are derived from Document.status. We page-filter post-derivation.
        if (status === 'PENDING_REVIEW' || status === 'REJECTED') {
          where.status = status;
        }
      }
      const submissions = await prisma.externalDocumentSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        take: 200,
        include: {
          qmsDocument: {
            select: { id: true, documentId: true, status: true, versionMajor: true, versionMinor: true, title: true },
          },
          rejectedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          supersededBy: { select: { id: true, externalVersionNumber: true } },
        },
      });

      let rows = submissions.map((s) => ({
        id: s.id,
        externalSystem: s.externalSystem,
        externalSubmissionId: s.externalSubmissionId,
        externalVersionNumber: s.externalVersionNumber,
        documentNumber: s.documentNumber,
        documentType: s.documentType,
        payloadSha256: s.payloadSha256,
        controlsMappedCount: Array.isArray(s.controlsMapped) ? s.controlsMapped.length : 0,
        submittedAt: s.submittedAt,
        rejectedAt: s.rejectedAt,
        rejectedBy: s.rejectedBy,
        rejectionReason: s.rejectionReason,
        supersededBy: s.supersededBy,
        qmsDocument: s.qmsDocument,
        status: deriveSubmissionStatusFromDocument(s.qmsDocument?.status, s.rejectedAt),
      }));

      if (status && ['UNDER_REVIEW', 'APPROVED', 'QUALITY_RELEASED'].includes(status)) {
        rows = rows.filter((r) => r.status === status);
      }

      res.json({ submissions: rows });
    } catch (err) {
      console.error('[external-ssp] list error:', err);
      res.status(500).json({ error: 'Failed to list submissions' });
    }
  },
);

/** GET /api/external-submissions/:id — detail, System Admin only */
router.get(
  '/:id',
  authMiddleware,
  requireRoles('System Admin', 'Admin', 'System Administrator'),
  async (req, res) => {
    try {
      const submission = await prisma.externalDocumentSubmission.findUnique({
        where: { id: req.params.id },
        include: {
          qmsDocument: {
            select: {
              id: true,
              documentId: true,
              title: true,
              status: true,
              versionMajor: true,
              versionMinor: true,
              effectiveDate: true,
              authorId: true,
            },
          },
          pdfFileAsset: {
            select: { id: true, filename: true, sizeBytes: true, sha256: true, contentType: true },
          },
          rejectedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          supersededBy: { select: { id: true, externalVersionNumber: true, qmsDocumentId: true } },
          supersedes: { select: { id: true, externalVersionNumber: true, qmsDocumentId: true } },
        },
      });
      if (!submission) return res.status(404).json({ error: 'Submission not found' });

      res.json({
        submission: {
          ...submission,
          status: deriveSubmissionStatusFromDocument(submission.qmsDocument?.status, submission.rejectedAt),
        },
      });
    } catch (err) {
      console.error('[external-ssp] detail error:', err);
      res.status(500).json({ error: 'Failed to load submission' });
    }
  },
);

/** POST /api/external-submissions/:id/reject — terminal reject, System Admin only */
router.post(
  '/:id/reject',
  authMiddleware,
  requireRoles('System Admin', 'Admin', 'System Administrator'),
  adminBody,
  async (req, res) => {
    try {
      const { reason } = req.body || {};
      if (typeof reason !== 'string' || reason.trim().length < 5) {
        return res.status(400).json({ error: 'reason is required (min 5 chars)' });
      }

      const submission = await prisma.externalDocumentSubmission.findUnique({
        where: { id: req.params.id },
        include: { qmsDocument: { select: { id: true, status: true } } },
      });
      if (!submission) return res.status(404).json({ error: 'Submission not found' });
      if (submission.rejectedAt) {
        return res.status(400).json({ error: 'Submission is already rejected' });
      }
      if (submission.qmsDocument?.status === 'EFFECTIVE') {
        return res.status(400).json({ error: 'Cannot reject — Document is already EFFECTIVE' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedSubmission = await tx.externalDocumentSubmission.update({
          where: { id: submission.id },
          data: {
            status: 'REJECTED',
            rejectedAt: new Date(),
            rejectedById: req.user.id,
            rejectionReason: reason.trim(),
          },
        });
        // Move the linked Document to ARCHIVED so it doesn't sit in someone's
        // review queue. ARCHIVED is terminal in QMS; the doc is still readable
        // but no longer routes through release.
        if (submission.qmsDocument) {
          await tx.document.update({
            where: { id: submission.qmsDocument.id },
            data: { status: 'ARCHIVED' },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            actorType: 'USER',
            action: 'EXTERNAL_SSP_SUBMISSION_REJECTED',
            entityType: 'ExternalDocumentSubmission',
            entityId: submission.id,
            afterValue: { reason: reason.trim() },
            ...getAuditContext(req),
          },
        });
        return updatedSubmission;
      });

      res.json({ ok: true, submission: result });
    } catch (err) {
      console.error('[external-ssp] reject error:', err);
      res.status(500).json({ error: 'Failed to reject submission' });
    }
  },
);

export default router;
