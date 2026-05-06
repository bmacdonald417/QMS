// /api/cmmc-control-tags — Phase 6 admin tagging API.
//
// Populates the two junction tables that feed the codex CMMC contract:
//   document_cmmc_control_tags (Document → controlId)
//   cmmc_document_control_tags (CmmcDocument → controlId)
//
// All endpoints require authMiddleware (mounted at use site) plus
// requireRoles('System Admin', 'Admin'). Read-side returns the full
// federated doc list with current tags so the UI can render a single
// tagging surface. Mutations validate that controlId is in the vendored
// 17-control governance list — no out-of-scope tags can be created here.

import express from 'express';
import { prisma } from './db.js';
import { requireRoles } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';
import { getMacTechOrgId } from './lib/orgScope.js';
import {
  GOVERNANCE_CONTROLS,
  GOVERNANCE_CONTROLS_VERSION,
  GOVERNANCE_CONTROLS_LAST_UPDATED,
  isGovernanceControlId,
} from './lib/cmmc/governanceControls.js';

const router = express.Router();
const ADMIN_ROLES = ['System Admin', 'Admin'];

// Vendored control list — the picker on the frontend reads this.
router.get('/controls', requireRoles(...ADMIN_ROLES), (req, res) => {
  res.json({
    version: GOVERNANCE_CONTROLS_VERSION,
    last_updated: GOVERNANCE_CONTROLS_LAST_UPDATED,
    controls: GOVERNANCE_CONTROLS,
  });
});

// List every doc from both sources, with its current control tags. Single
// roundtrip for the admin grid. ~120 docs in prod today; well within a
// single-page render budget. Add server-side pagination if it grows.
router.get('/documents', requireRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const orgId = getMacTechOrgId();

    const [docs, cmmcDocs] = await Promise.all([
      prisma.document.findMany({
        where: { organizationId: orgId },
        orderBy: { documentId: 'asc' },
        select: {
          id: true,
          documentId: true,
          title: true,
          documentType: true,
          status: true,
          versionMajor: true,
          versionMinor: true,
          cmmcControlTags: {
            select: { controlId: true, coverageNote: true, createdAt: true },
            orderBy: { controlId: 'asc' },
          },
        },
      }),
      prisma.cmmcDocument.findMany({
        where: { organizationId: orgId },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          title: true,
          kind: true,
          status: true,
          cmmcControlTags: {
            select: { controlId: true, coverageNote: true, createdAt: true },
            orderBy: { controlId: 'asc' },
          },
        },
      }),
    ]);

    const rows = [
      ...docs.map((d) => ({
        source: 'qms_managed',
        id: d.id,
        code: d.documentId,
        title: d.title,
        kind: d.documentType,
        status: d.status,
        version: `${d.versionMajor}.${d.versionMinor}`,
        tags: d.cmmcControlTags,
      })),
      ...cmmcDocs.map((c) => ({
        source: 'cmmc_bundle',
        id: c.id,
        code: c.code,
        title: c.title,
        kind: c.kind,
        status: c.status,
        version: null,
        tags: c.cmmcControlTags,
      })),
    ];

    res.json({ documents: rows });
  } catch (err) {
    console.error('cmmc-control-tags list error:', err);
    res.status(500).json({ error: 'Failed to list documents with tags' });
  }
});

// Add a tag. Body: { source, docId, controlId, coverageNote? }
// Idempotent: re-adding the same (docId, controlId) updates coverageNote.
router.post('/', requireRoles(...ADMIN_ROLES), async (req, res) => {
  const { source, docId, controlId, coverageNote } = req.body || {};
  if (source !== 'qms_managed' && source !== 'cmmc_bundle') {
    return res.status(400).json({ error: "source must be 'qms_managed' or 'cmmc_bundle'" });
  }
  if (typeof docId !== 'string' || !docId.trim()) {
    return res.status(400).json({ error: 'docId is required' });
  }
  if (typeof controlId !== 'string' || !isGovernanceControlId(controlId)) {
    return res.status(400).json({
      error: 'controlId must be one of the 17 vendored governance controls',
    });
  }
  const note = typeof coverageNote === 'string' && coverageNote.trim()
    ? coverageNote.trim()
    : null;

  try {
    const orgId = getMacTechOrgId();

    if (source === 'qms_managed') {
      // Belt-and-suspenders: confirm the doc belongs to this tenant.
      const exists = await prisma.document.findFirst({
        where: { id: docId, organizationId: orgId },
        select: { id: true, documentId: true },
      });
      if (!exists) return res.status(404).json({ error: 'Document not found' });

      await prisma.documentCmmcControlTag.upsert({
        where: { documentId_controlId: { documentId: docId, controlId } },
        update: { coverageNote: note },
        create: { documentId: docId, controlId, coverageNote: note },
      });

      await createAuditLog({
        userId: req.user?.id ?? null,
        action: 'CMMC_CONTROL_TAG_ADD',
        entityType: 'Document',
        entityId: docId,
        afterValue: { controlId, coverageNote: note, code: exists.documentId },
        ...getAuditContext(req),
      });
    } else {
      const exists = await prisma.cmmcDocument.findFirst({
        where: { id: docId, organizationId: orgId },
        select: { id: true, code: true },
      });
      if (!exists) return res.status(404).json({ error: 'CmmcDocument not found' });

      await prisma.cmmcDocumentControlTag.upsert({
        where: { cmmcDocumentId_controlId: { cmmcDocumentId: docId, controlId } },
        update: { coverageNote: note },
        create: { cmmcDocumentId: docId, controlId, coverageNote: note },
      });

      await createAuditLog({
        userId: req.user?.id ?? null,
        action: 'CMMC_CONTROL_TAG_ADD',
        entityType: 'CmmcDocument',
        entityId: docId,
        afterValue: { controlId, coverageNote: note, code: exists.code },
        ...getAuditContext(req),
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('cmmc-control-tags add error:', err);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// Remove a tag. Body: { source, docId, controlId }
router.delete('/', requireRoles(...ADMIN_ROLES), async (req, res) => {
  const { source, docId, controlId } = req.body || {};
  if (source !== 'qms_managed' && source !== 'cmmc_bundle') {
    return res.status(400).json({ error: "source must be 'qms_managed' or 'cmmc_bundle'" });
  }
  if (typeof docId !== 'string' || !docId.trim()) {
    return res.status(400).json({ error: 'docId is required' });
  }
  if (typeof controlId !== 'string' || !controlId.trim()) {
    return res.status(400).json({ error: 'controlId is required' });
  }

  try {
    if (source === 'qms_managed') {
      const result = await prisma.documentCmmcControlTag.deleteMany({
        where: { documentId: docId, controlId },
      });
      await createAuditLog({
        userId: req.user?.id ?? null,
        action: 'CMMC_CONTROL_TAG_REMOVE',
        entityType: 'Document',
        entityId: docId,
        afterValue: { controlId, removed: result.count },
        ...getAuditContext(req),
      });
      res.json({ ok: true, removed: result.count });
    } else {
      const result = await prisma.cmmcDocumentControlTag.deleteMany({
        where: { cmmcDocumentId: docId, controlId },
      });
      await createAuditLog({
        userId: req.user?.id ?? null,
        action: 'CMMC_CONTROL_TAG_REMOVE',
        entityType: 'CmmcDocument',
        entityId: docId,
        afterValue: { controlId, removed: result.count },
        ...getAuditContext(req),
      });
      res.json({ ok: true, removed: result.count });
    }
  } catch (err) {
    console.error('cmmc-control-tags remove error:', err);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

export default router;
