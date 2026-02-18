/**
 * FormRecord "Records Vault" API — DRAFT + FINAL with audit.
 * No QMS approval workflow; Governance provides approvalTrail.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from './db.js';
import { authMiddleware, requirePermission } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';
import { generateFormRecordPdf } from './pdf.js';
import { computeQmsHash, getGovernanceApprovalStatus } from './governance.js';

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const INTEGRATION_KEY = process.env.INTEGRATION_KEY || '';
const FORM_RECORDS_DIR = path.join(UPLOAD_DIR, 'form-records');

const ENTITY = 'FormRecord';

/** Extract prefix for record number from templateCode (e.g. MAC-FRM-013 -> FRM-013) */
function recordNumberPrefix(templateCode) {
  if (!templateCode || typeof templateCode !== 'string') return 'FRM';
  const match = templateCode.match(/([A-Z]{2,}-\d+)$/i) || templateCode.match(/(FRM-\d+)/i);
  return match ? match[1].toUpperCase() : templateCode.replace(/\s/g, '-').slice(0, 20);
}

/**
 * Resolve template by code: EFFECTIVE document with documentId = templateCode,
 * else highest version (versionMajor, versionMinor) where status in APPROVED, IN_REVIEW, DRAFT.
 */
export async function resolveTemplate(templateCode) {
  const code = String(templateCode).trim();
  const effective = await prisma.document.findFirst({
    where: { documentId: code, status: 'EFFECTIVE' },
    orderBy: [{ versionMajor: 'desc' }, { versionMinor: 'desc' }],
  });
  if (effective) {
    return {
      templateDocumentId: effective.id,
      templateCode: effective.documentId,
      templateVersionMajor: effective.versionMajor,
      templateVersionMinor: effective.versionMinor,
    };
  }
  const fallback = await prisma.document.findFirst({
    where: { documentId: code, status: { in: ['APPROVED', 'IN_REVIEW', 'DRAFT'] } },
    orderBy: [{ versionMajor: 'desc' }, { versionMinor: 'desc' }],
  });
  if (fallback) {
    return {
      templateDocumentId: fallback.id,
      templateCode: fallback.documentId,
      templateVersionMajor: fallback.versionMajor,
      templateVersionMinor: fallback.versionMinor,
    };
  }
  return null;
}

/**
 * Generate next record number: prefix-Year-6digitSeq (e.g. FRM-013-2026-000001).
 * Uses FormRecordCounter for race-safe increment.
 */
async function generateRecordNumber(templateCode) {
  const prefix = recordNumberPrefix(templateCode);
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;

  const next = await prisma.$transaction(async (tx) => {
    const counter = await tx.formRecordCounter.findUnique({
      where: { prefix_year: { prefix, year } },
    });
    const nextSeq = counter ? counter.nextSeq + 1 : 1;
    await tx.formRecordCounter.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, nextSeq },
      update: { nextSeq },
    });
    return nextSeq;
  });

  const seqStr = String(next).padStart(6, '0');
  return `${prefix}-${year}-${seqStr}`;
}

/** Middleware: allow JWT or X-INTEGRATION-KEY; set req.formRecordActor and req.auditUserId */
async function formRecordAuth(req, res, next) {
  const integrationKey = req.headers['x-integration-key'];
  if (INTEGRATION_KEY && integrationKey === INTEGRATION_KEY) {
    req.formRecordActor = 'integration';
    let auditUserId = process.env.INTEGRATION_AUDIT_USER_ID;
    if (!auditUserId) {
      const sysUser = await prisma.user.findFirst({
        where: { role: { name: 'System Admin' } },
        select: { id: true },
      });
      auditUserId = sysUser?.id ?? null;
    }
    req.auditUserId = auditUserId;
    return next();
  }
  authMiddleware(req, res, () => {
    req.formRecordActor = 'user';
    req.auditUserId = req.user?.id ?? null;
    next();
  });
}

function requireFormRecordPermission(permission) {
  return (req, res, next) => {
    if (req.formRecordActor === 'integration') return next();
    if (req.formRecordActor !== 'user' || !req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.roleName === 'System Admin' || req.user.roleName === 'Admin') return next();
    const perms = req.user.permissions || [];
    if (!perms.includes(permission)) return res.status(403).json({ error: `Missing permission: ${permission}` });
    next();
  };
}

function auditUserId(req) {
  return req.auditUserId || req.user?.id;
}

// GET /api/form-records — list with filters, paginated
router.get('/', formRecordAuth, requireFormRecordPermission('form_records:view'), async (req, res) => {
  try {
    const { templateCode, relatedEntityType, relatedEntityId, status, q, page = '1', limit = '20', startDate, endDate } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (templateCode) where.templateCode = String(templateCode).trim();
    if (relatedEntityType) where.relatedEntityType = String(relatedEntityType).trim().toUpperCase();
    if (relatedEntityId) where.relatedEntityId = String(relatedEntityId).trim();
    if (status) where.status = String(status).trim().toUpperCase();
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const d = new Date(String(startDate));
        if (!isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (endDate) {
        const d = new Date(String(endDate));
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          where.createdAt.lte = d;
        }
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }
    if (q && String(q).trim()) {
      const qq = String(q).trim();
      where.OR = [
        { recordNumber: { contains: qq, mode: 'insensitive' } },
        { title: { contains: qq, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.formRecord.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          templateDocument: { select: { documentId: true, title: true, versionMajor: true, versionMinor: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.formRecord.count({ where }),
    ]);

    const auditUid = auditUserId(req);
    if (auditUid) {
      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: auditUid,
        action: 'FORM_RECORD_VIEWED',
        entityType: ENTITY,
        entityId: null,
        afterValue: { list: true, count: records.length },
        reason: req.formRecordActor === 'integration' ? 'Governance integration' : null,
        ...auditCtx,
      });
    }

    res.json({
      records,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('Form records list error:', err);
    res.status(500).json({ error: 'Failed to list form records' });
  }
});

// GET /api/form-records/:id/pdf — stream stored PDF or generate snapshot (export)
router.get('/:id/pdf', formRecordAuth, requireFormRecordPermission('form_records:export'), async (req, res) => {
  try {
    const record = await prisma.formRecord.findUnique({
      where: { id: req.params.id },
      include: { pdfFileAsset: true },
    });
    if (!record) return res.status(404).json({ error: 'Form record not found' });

    const auditUid = auditUserId(req);
    if (auditUid) {
      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: auditUid,
        action: 'FORM_RECORD_EXPORTED',
        entityType: ENTITY,
        entityId: record.id,
        reason: req.formRecordActor === 'integration' ? 'Governance integration' : null,
        ...auditCtx,
      });
    }

    if (record.pdfFileAssetId && record.pdfFileAsset && !record.pdfFileAsset.isDeleted) {
      const filePath = path.join(UPLOAD_DIR, record.pdfFileAsset.storageKey);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', record.pdfFileAsset.contentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${record.pdfFileAsset.filename}"`);
        const stream = fs.createReadStream(filePath);
        return stream.pipe(res);
      }
    }

    const pdfBuffer = await generateFormRecordPdf(record);
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    const filename = `form-record-${record.recordNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  } catch (err) {
    console.error('Form record PDF error:', err);
    res.status(500).json({ error: 'Failed to stream PDF' });
  }
});

// GET /api/form-records/:id — full record including payload
router.get('/:id', formRecordAuth, requireFormRecordPermission('form_records:view'), async (req, res) => {
  try {
    const record = await prisma.formRecord.findUnique({
      where: { id: req.params.id },
      include: {
        templateDocument: { select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        updatedBy: { select: { id: true, firstName: true, lastName: true } },
        finalizedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!record) return res.status(404).json({ error: 'Form record not found' });

    const auditUid = auditUserId(req);
    const auditCtx = getAuditContext(req);
    if (auditUid) {
      await createAuditLog({
        userId: auditUid,
        action: 'FORM_RECORD_VIEWED',
        entityType: ENTITY,
        entityId: record.id,
        reason: req.formRecordActor === 'integration' ? 'Governance integration' : null,
        ...auditCtx,
      });
    }

    if (!record.qmsHash && record.status === 'FINAL') {
      record.qmsHash = computeQmsHash('FormRecord', record);
    }
    record.recordVersion = record.recordVersion ?? 1;
    res.json({ record });
  } catch (err) {
    console.error('Form record get error:', err);
    res.status(500).json({ error: 'Failed to load form record' });
  }
});

// GET /api/form-records/:id/governance-approval
router.get('/:id/governance-approval', formRecordAuth, requireFormRecordPermission('form_records:view'), async (req, res) => {
  try {
    const result = await getGovernanceApprovalStatus('FormRecord', req.params.id);
    if (!result) return res.json({ hasArtifact: false, artifact: null, verification: null });
    res.json({
      hasArtifact: true,
      artifact: {
        id: result.artifact.id,
        entityType: result.artifact.entityType,
        entityId: result.artifact.entityId,
        recordVersion: result.artifact.recordVersion,
        qmsHash: result.artifact.qmsHash,
        signedAt: result.artifact.signedAt,
        verifiedAt: result.artifact.verifiedAt,
        verificationStatus: result.artifact.verificationStatus,
      },
      verification: result.verification,
    });
  } catch (err) {
    console.error('Form record governance-approval error:', err);
    res.status(500).json({ error: 'Failed to load governance approval' });
  }
});

// POST /api/form-records — create DRAFT
router.post('/', formRecordAuth, requireFormRecordPermission('form_records:create'), async (req, res) => {
  try {
    const { templateDocumentId, templateCode, title, relatedEntityType, relatedEntityId, payload, governanceSource } = req.body || {};
    const validTypes = ['SOLICITATION', 'CONTRACT', 'CHANGE', 'CAPA', 'OTHER'];
    const relTypeRaw = relatedEntityType ? String(relatedEntityType).trim().toUpperCase() : 'OTHER';
    const relType = validTypes.includes(relTypeRaw) ? relTypeRaw : 'OTHER';
    const relId = relatedEntityId != null ? String(relatedEntityId).trim() : '';

    let templateDocumentIdResolved;
    let templateCodeResolved;
    let templateVersionMajor;
    let templateVersionMinor;

    if (templateDocumentId) {
      const doc = await prisma.document.findUnique({ where: { id: templateDocumentId } });
      if (!doc) return res.status(400).json({ error: 'Template document not found' });
      templateDocumentIdResolved = doc.id;
      templateCodeResolved = doc.documentId;
      templateVersionMajor = doc.versionMajor;
      templateVersionMinor = doc.versionMinor;
    } else if (templateCode) {
      const resolved = await resolveTemplate(templateCode);
      if (!resolved) return res.status(400).json({ error: 'Template not found for code: ' + templateCode });
      templateDocumentIdResolved = resolved.templateDocumentId;
      templateCodeResolved = resolved.templateCode;
      templateVersionMajor = resolved.templateVersionMajor;
      templateVersionMinor = resolved.templateVersionMinor;
    } else {
      return res.status(400).json({ error: 'templateDocumentId or templateCode is required' });
    }

    const recordNumber = await generateRecordNumber(templateCodeResolved);
    const titleVal = title && String(title).trim() ? String(title).trim() : `${templateCodeResolved} - ${recordNumber}`;
    const payloadVal = payload != null && typeof payload === 'object' ? payload : {};

    const record = await prisma.formRecord.create({
      data: {
        recordNumber,
        templateDocumentId: templateDocumentIdResolved,
        templateCode: templateCodeResolved,
        templateVersionMajor,
        templateVersionMinor,
        title: titleVal,
        status: 'DRAFT',
        payload: payloadVal,
        governanceSource: governanceSource != null && typeof governanceSource === 'object' ? governanceSource : undefined,
        relatedEntityType: relType,
        relatedEntityId: relId,
        recordVersion: 1,
        createdById: req.user?.id ?? undefined,
      },
      include: {
        templateDocument: { select: { documentId: true, title: true } },
      },
    });
    const qmsHashCreate = computeQmsHash('FormRecord', { ...record, finalizedAt: null });
    await prisma.formRecord.update({
      where: { id: record.id },
      data: { qmsHash: qmsHashCreate },
    });
    record.qmsHash = qmsHashCreate;

    const auditUid = auditUserId(req);
    if (auditUid) {
      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: auditUid,
        action: 'FORM_RECORD_CREATED',
        entityType: ENTITY,
        entityId: record.id,
        afterValue: { recordNumber: record.recordNumber, templateCode: record.templateCode, relatedEntityId: record.relatedEntityId },
        reason: req.formRecordActor === 'integration' ? 'Governance integration' : null,
        ...auditCtx,
      });
    }

    res.status(201).json({ record });
  } catch (err) {
    console.error('Form record create error:', err);
    res.status(500).json({ error: 'Failed to create form record' });
  }
});

// PUT /api/form-records/:id — update DRAFT only
router.put('/:id', formRecordAuth, requireFormRecordPermission('form_records:update'), async (req, res) => {
  try {
    const existing = await prisma.formRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Form record not found' });
    if (existing.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT records can be updated' });

    const { payload, title, governanceSource, approvalTrail } = req.body || {};
    const data = {};
    if (payload != null && typeof payload === 'object') data.payload = payload;
    if (title !== undefined) data.title = String(title).trim();
    if (governanceSource !== undefined) data.governanceSource = governanceSource != null && typeof governanceSource === 'object' ? governanceSource : undefined;
    if (approvalTrail !== undefined) data.approvalTrail = approvalTrail != null && (typeof approvalTrail === 'object' || Array.isArray(approvalTrail)) ? approvalTrail : undefined;
    data.updatedById = req.user?.id ?? undefined;
    data.recordVersion = (existing.recordVersion ?? 1) + 1;
    const payloadForHash = data.payload !== undefined ? data.payload : existing.payload;
    const titleForHash = data.title !== undefined ? data.title : existing.title;
    const recordForHash = {
      ...existing,
      ...data,
      payload: payloadForHash,
      title: titleForHash,
      recordVersion: data.recordVersion,
      finalizedAt: existing.finalizedAt,
    };
    data.qmsHash = computeQmsHash('FormRecord', recordForHash);

    const updated = await prisma.formRecord.update({
      where: { id: req.params.id },
      data,
      include: {
        templateDocument: { select: { documentId: true, title: true } },
      },
    });

    const auditUid = auditUserId(req);
    if (auditUid) {
      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: auditUid,
        action: 'FORM_RECORD_UPDATED',
        entityType: ENTITY,
        entityId: updated.id,
        beforeValue: { status: existing.status, updatedAt: existing.updatedAt },
        afterValue: { status: updated.status, updatedAt: updated.updatedAt },
        reason: req.formRecordActor === 'integration' ? 'Governance integration' : null,
        ...auditCtx,
      });
    }

    res.json({ record: updated });
  } catch (err) {
    console.error('Form record update error:', err);
    res.status(500).json({ error: 'Failed to update form record' });
  }
});

// POST /api/form-records/:id/finalize — lock as FINAL, store approvalTrail, optional PDF
router.post('/:id/finalize', formRecordAuth, requireFormRecordPermission('form_records:finalize'), async (req, res) => {
  try {
    const existing = await prisma.formRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Form record not found' });
    if (existing.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT records can be finalized' });

    const { approvalTrail, payload, pdfBase64 } = req.body || {};
    if (!approvalTrail || (typeof approvalTrail !== 'object' && !Array.isArray(approvalTrail))) {
      return res.status(400).json({ error: 'approvalTrail (object or array) is required' });
    }

    const now = new Date();
    let pdfFileAssetId = null;
    const uploadUserId = req.user?.id ?? req.auditUserId;

    if (pdfBase64 && typeof pdfBase64 === 'string') {
      if (!uploadUserId) return res.status(400).json({ error: 'Cannot store PDF: no user context. Set INTEGRATION_AUDIT_USER_ID or use JWT when sending pdfBase64.' });
      try {
        const buf = Buffer.from(pdfBase64, 'base64');
        if (buf.length > 0) {
          if (!fs.existsSync(FORM_RECORDS_DIR)) fs.mkdirSync(FORM_RECORDS_DIR, { recursive: true });
          const filename = `form-record-${existing.id}.pdf`;
          const relativeKey = `form-records/${filename}`;
          const filePath = path.join(UPLOAD_DIR, relativeKey);
          fs.writeFileSync(filePath, buf);
          const fileAsset = await prisma.fileAsset.create({
            data: {
              storageKey: relativeKey,
              filename,
              contentType: 'application/pdf',
              sizeBytes: buf.length,
              uploadedById: uploadUserId || existing.createdById,
            },
          });
          pdfFileAssetId = fileAsset.id;
        }
      } catch (e) {
        console.error('PDF save error:', e);
        return res.status(400).json({ error: 'Invalid pdfBase64 or write failed' });
      }
    }

    const finalPayload = payload != null && typeof payload === 'object' ? payload : existing.payload;
    const recordVersionFinal = (existing.recordVersion ?? 1) + 1;
    const recordForHash = {
      ...existing,
      status: 'FINAL',
      payload: finalPayload,
      finalizedAt: now,
      recordVersion: recordVersionFinal,
    };
    const qmsHashFinal = computeQmsHash('FormRecord', recordForHash);

    const updateData = {
      status: 'FINAL',
      lockedAt: now,
      finalizedAt: now,
      finalizedById: req.user?.id ?? undefined,
      approvalTrail,
      recordVersion: recordVersionFinal,
      qmsHash: qmsHashFinal,
      ...(payload != null && typeof payload === 'object' ? { payload } : {}),
      ...(pdfFileAssetId ? { pdfFileAssetId } : {}),
    };

    const updated = await prisma.formRecord.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        templateDocument: { select: { documentId: true, title: true } },
        finalizedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const auditUid = auditUserId(req);
    if (auditUid) {
      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: auditUid,
        action: 'FORM_RECORD_FINALIZED',
        entityType: ENTITY,
        entityId: updated.id,
        beforeValue: { status: existing.status },
        afterValue: { status: 'FINAL', finalizedAt: now, hasPdf: !!pdfFileAssetId },
        reason: req.formRecordActor === 'integration' ? 'Governance integration' : null,
        ...auditCtx,
      });
    }

    res.json({ record: updated });
  } catch (err) {
    console.error('Form record finalize error:', err);
    res.status(500).json({ error: 'Failed to finalize form record' });
  }
});

export default router;
