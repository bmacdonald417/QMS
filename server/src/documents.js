import express from 'express';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { prisma } from './db.js';
import { requireRoles } from './auth.js';

const router = express.Router();

const DOC_TYPE_PREFIX = {
  SOP: 'SOP',
  POLICY: 'POL',
  WORK_INSTRUCTION: 'WIN',
  FORM: 'FRM',
  OTHER: 'DOC',
};

function normalizeDocType(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!Object.keys(DOC_TYPE_PREFIX).includes(normalized)) return null;
  return normalized;
}

function normalizeReviewDecision(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'REQUIRES_REVISION') return 'REQUIRES_REVISION';
  if (normalized === 'APPROVED_WITH_COMMENTS' || normalized === 'APPROVED') {
    return 'APPROVED_WITH_COMMENTS';
  }
  return null;
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

async function createHistory({
  documentId,
  userId,
  action,
  details = null,
  digitalSignature = null,
}) {
  return prisma.documentHistory.create({
    data: {
      documentId,
      userId,
      action,
      details,
      digitalSignature,
    },
  });
}

async function createNotifications(userIds, message, link) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, message, link })),
  });
}

export async function generateDocId(docType) {
  const prefix = DOC_TYPE_PREFIX[docType] || 'DOC';
  const existing = await prisma.document.findMany({
    where: { docType },
    select: { docId: true },
  });

  let max = 0;
  for (const row of existing) {
    const match = row.docId?.match(/-(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }

  const next = String(max + 1).padStart(3, '0');
  return `MAC-${prefix}-${next}`;
}

// GET /api/documents
router.get('/', async (_req, res) => {
  try {
    const documents = await prisma.document.findMany({
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ documents });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignments: {
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        history: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { timestamp: 'desc' },
        },
      },
    });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    res.json({ document });
  } catch (err) {
    console.error('Get document error:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST /api/documents (Draft)
router.post('/', async (req, res) => {
  try {
    const { title, docType, content } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const normalizedType = normalizeDocType(docType || 'OTHER');
    if (!normalizedType) {
      return res.status(400).json({ error: 'Invalid docType' });
    }

    const docId = await generateDocId(normalizedType);
    const created = await prisma.document.create({
      data: {
        docId,
        title,
        docType: normalizedType,
        majorVersion: 1,
        minorVersion: 0,
        status: 'DRAFT',
        content: content || '',
        authorId: req.user.id,
      },
    });

    await createHistory({
      documentId: created.id,
      userId: req.user.id,
      action: 'Created',
      details: {
        status: 'Draft',
        docId: created.docId,
        version: `${created.majorVersion}.${created.minorVersion}`,
      },
    });

    res.status(201).json({ document: created });
  } catch (err) {
    console.error('Create document error:', err);
    res.status(500).json({ error: 'Failed to create draft document' });
  }
});

// POST /api/documents/:id/revise
router.post('/:id/revise', async (req, res) => {
  try {
    const { revisionType } = req.body;
    const normalized = typeof revisionType === 'string' ? revisionType.trim().toLowerCase() : '';
    if (!['major', 'minor'].includes(normalized)) {
      return res.status(400).json({ error: 'revisionType must be "major" or "minor"' });
    }

    const source = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ error: 'Document not found' });
    if (source.status !== 'EFFECTIVE') {
      return res.status(400).json({ error: 'Only effective documents can be revised' });
    }

    const nextMajor =
      normalized === 'major' ? source.majorVersion + 1 : source.majorVersion;
    const nextMinor = normalized === 'major' ? 0 : source.minorVersion + 1;

    const revisedDraft = await prisma.document.create({
      data: {
        docId: source.docId,
        title: source.title,
        docType: source.docType,
        majorVersion: nextMajor,
        minorVersion: nextMinor,
        status: 'DRAFT',
        content: source.content || '',
        authorId: req.user.id,
      },
    });

    await createHistory({
      documentId: revisedDraft.id,
      userId: req.user.id,
      action: 'Revised',
      details: {
        revisionType: normalized,
        fromDocumentId: source.id,
        previousVersion: `${source.majorVersion}.${source.minorVersion}`,
        newVersion: `${revisedDraft.majorVersion}.${revisedDraft.minorVersion}`,
      },
    });

    return res.status(201).json({ document: revisedDraft });
  } catch (err) {
    console.error('Revise document error:', err);
    return res.status(500).json({ error: 'Failed to create revised draft' });
  }
});

// PATCH /api/documents/:id (Author can edit while Draft)
router.patch('/:id', async (req, res) => {
  try {
    const { title, content, docType } = req.body;
    const existing = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the author can edit this draft' });
    }
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only Draft documents can be edited' });
    }

    const updateData = {};
    if (typeof title === 'string') updateData.title = title;
    if (typeof content === 'string') updateData.content = content;
    if (typeof docType === 'string') {
      const normalizedType = normalizeDocType(docType);
      if (!normalizedType) return res.status(400).json({ error: 'Invalid docType' });
      updateData.docType = normalizedType;
    }

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await createHistory({
      documentId: updated.id,
      userId: req.user.id,
      action: 'Updated Draft',
      details: { fields: Object.keys(updateData) },
    });

    res.json({ document: updated });
  } catch (err) {
    console.error('Update draft error:', err);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

// POST /api/documents/:id/submit
router.post('/:id/submit', async (req, res) => {
  try {
    const { reviewerIds = [], approverId, comments } = req.body;
    if (!Array.isArray(reviewerIds) || reviewerIds.length === 0) {
      return res.status(400).json({ error: 'reviewerIds is required' });
    }
    if (!approverId) return res.status(400).json({ error: 'approverId is required' });

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the author can submit for review' });
    }
    if (document.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only Draft documents can be submitted' });
    }

    const uniqueReviewers = [...new Set(reviewerIds)].filter((id) => id !== req.user.id);
    if (!uniqueReviewers.length) {
      return res.status(400).json({ error: 'At least one reviewer is required' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: { status: 'IN_REVIEW' },
      });

      await tx.documentAssignment.deleteMany({
        where: { documentId: document.id, status: 'PENDING' },
      });

      await tx.documentAssignment.createMany({
        data: uniqueReviewers.map((assigneeId) => ({
          documentId: document.id,
          assigneeId,
          taskType: 'REVIEW',
          status: 'PENDING',
        })),
      });

      await tx.documentAssignment.create({
        data: {
          documentId: document.id,
          assigneeId: approverId,
          taskType: 'APPROVAL',
          status: 'PENDING',
        },
      });

      await tx.documentHistory.create({
        data: {
          documentId: document.id,
          userId: req.user.id,
          action: 'Submitted for Review',
          details: { reviewerIds: uniqueReviewers, approverId, comments: comments || null },
        },
      });
    });

    const message = `You have been assigned to review document ${document.docId}.`;
    const link = `/documents/${document.id}`;
    await createNotifications([...uniqueReviewers, approverId], message, link);

    res.json({ ok: true });
  } catch (err) {
    console.error('Submit for review error:', err);
    res.status(500).json({ error: 'Failed to submit document for review' });
  }
});

// POST /api/documents/:id/review
router.post('/:id/review', async (req, res) => {
  try {
    const { decision, comments } = req.body;
    const normalizedDecision = normalizeReviewDecision(decision);
    if (!normalizedDecision) return res.status(400).json({ error: 'Invalid review decision' });

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const assignment = await prisma.documentAssignment.findFirst({
      where: {
        documentId: document.id,
        assigneeId: req.user.id,
        taskType: 'REVIEW',
        status: 'PENDING',
      },
    });
    if (!assignment) return res.status(403).json({ error: 'No pending review assignment found' });

    if (normalizedDecision === 'REQUIRES_REVISION') {
      await prisma.$transaction(async (tx) => {
        await tx.documentAssignment.update({
          where: { id: assignment.id },
          data: {
            status: 'REJECTED',
            completedAt: new Date(),
            comments: comments || null,
          },
        });
        await tx.documentAssignment.updateMany({
          where: {
            documentId: document.id,
            status: 'PENDING',
          },
          data: {
            status: 'REJECTED',
            completedAt: new Date(),
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { status: 'DRAFT' },
        });
        await tx.documentHistory.create({
          data: {
            documentId: document.id,
            userId: req.user.id,
            action: 'Review Requires Revision',
            details: { comments: comments || null },
          },
        });
      });

      await createNotifications(
        [document.authorId],
        `Document ${document.docId} requires revision.`,
        `/documents/${document.id}`
      );

      return res.json({ ok: true, status: 'DRAFT' });
    }

    await prisma.documentAssignment.update({
      where: { id: assignment.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        comments: comments || null,
      },
    });

    await createHistory({
      documentId: document.id,
      userId: req.user.id,
      action: 'Review Approved',
      details: { comments: comments || null },
    });

    const pendingReviewCount = await prisma.documentAssignment.count({
      where: {
        documentId: document.id,
        taskType: 'REVIEW',
        status: 'PENDING',
      },
    });

    if (pendingReviewCount === 0) {
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'PENDING_APPROVAL' },
      });
      await createHistory({
        documentId: document.id,
        userId: req.user.id,
        action: 'All Reviews Completed',
      });

      const approvers = await prisma.documentAssignment.findMany({
        where: {
          documentId: document.id,
          taskType: 'APPROVAL',
          status: 'PENDING',
        },
        select: { assigneeId: true },
      });

      await createNotifications(
        approvers.map((a) => a.assigneeId),
        `Document ${document.docId} is pending your approval.`,
        `/documents/${document.id}`
      );
    }

    return res.json({ ok: true, status: pendingReviewCount === 0 ? 'PENDING_APPROVAL' : 'IN_REVIEW' });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// POST /api/documents/:id/approve
router.post('/:id/approve', requireRoles('Manager', 'Quality'), async (req, res) => {
  try {
    const { password, comments } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required for digital signature' });

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: 'Document is not pending approval' });
    }
    if (document.authorId === req.user.id) {
      return res.status(403).json({ error: 'Author cannot approve their own document' });
    }

    const approvalAssignment = await prisma.documentAssignment.findFirst({
      where: {
        documentId: document.id,
        assigneeId: req.user.id,
        taskType: 'APPROVAL',
        status: 'PENDING',
      },
    });
    if (!approvalAssignment) {
      return res.status(403).json({ error: 'No pending approval assignment found' });
    }

    const signer = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true },
    });
    const passwordOk = signer ? await bcrypt.compare(password, signer.password) : false;
    if (!passwordOk) {
      return res.status(401).json({ error: 'Password verification failed' });
    }

    const documentHash = sha256(document.content || '');
    const signatureEvidence = {
      documentHash,
      documentHashAlgorithm: 'SHA-256',
      timestamp: new Date().toISOString(),
      signerId: req.user.id,
      meaning: 'Approval',
    };

    await prisma.$transaction(async (tx) => {
      await tx.documentAssignment.update({
        where: { id: approvalAssignment.id },
        data: { status: 'COMPLETED', completedAt: new Date(), comments: comments || null },
      });

      await tx.document.update({
        where: { id: document.id },
        data: { status: 'PENDING_QUALITY_RELEASE' },
      });

      await tx.documentHistory.create({
        data: {
          documentId: document.id,
          userId: req.user.id,
          action: 'Approved',
          details: { comments: comments || null },
          digitalSignature: signatureEvidence,
        },
      });

      const qualityUsers = await tx.user.findMany({
        where: { role: { name: 'Quality' } },
        select: { id: true },
      });

      for (const q of qualityUsers) {
        const existingPending = await tx.documentAssignment.findFirst({
          where: {
            documentId: document.id,
            assigneeId: q.id,
            taskType: 'QUALITY_RELEASE',
            status: 'PENDING',
          },
        });
        if (!existingPending) {
          await tx.documentAssignment.create({
            data: {
              documentId: document.id,
              assigneeId: q.id,
              taskType: 'QUALITY_RELEASE',
              status: 'PENDING',
            },
          });
        }
      }
    });

    const qualityUsers = await prisma.user.findMany({
      where: { role: { name: 'Quality' } },
      select: { id: true },
    });
    await createNotifications(
      qualityUsers.map((u) => u.id),
      `Document ${document.docId} is pending quality release.`,
      `/documents/${document.id}`
    );

    res.json({ ok: true, status: 'PENDING_QUALITY_RELEASE' });
  } catch (err) {
    console.error('Approve document error:', err);
    res.status(500).json({ error: 'Failed to approve document' });
  }
});

// POST /api/documents/:id/release
router.post('/:id/release', requireRoles('Quality'), async (req, res) => {
  try {
    const { password, comments } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required for digital signature' });

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.status !== 'PENDING_QUALITY_RELEASE') {
      return res.status(400).json({ error: 'Document is not pending quality release' });
    }

    const signer = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true },
    });
    const passwordOk = signer ? await bcrypt.compare(password, signer.password) : false;
    if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });

    const qualityAssignment = await prisma.documentAssignment.findFirst({
      where: {
        documentId: document.id,
        assigneeId: req.user.id,
        taskType: 'QUALITY_RELEASE',
        status: 'PENDING',
      },
    });

    const documentHash = sha256(document.content || '');
    const signatureEvidence = {
      documentHash,
      documentHashAlgorithm: 'SHA-256',
      timestamp: new Date().toISOString(),
      signerId: req.user.id,
      meaning: 'Quality Release',
    };

    await prisma.$transaction(async (tx) => {
      if (qualityAssignment) {
        await tx.documentAssignment.update({
          where: { id: qualityAssignment.id },
          data: { status: 'COMPLETED', completedAt: new Date(), comments: comments || null },
        });
      }

      await tx.document.update({
        where: { id: document.id },
        data: { status: 'EFFECTIVE' },
      });

      await tx.document.updateMany({
        where: {
          docId: document.docId,
          id: { not: document.id },
          status: 'EFFECTIVE',
        },
        data: { status: 'ARCHIVED' },
      });

      await tx.documentHistory.create({
        data: {
          documentId: document.id,
          userId: req.user.id,
          action: 'Released',
          details: { comments: comments || null },
          digitalSignature: signatureEvidence,
        },
      });
    });

    const allUsers = await prisma.user.findMany({ select: { id: true } });
    await createNotifications(
      allUsers.map((u) => u.id),
      `Document ${document.docId} is now effective.`,
      `/documents/${document.id}`
    );

    res.json({ ok: true, status: 'EFFECTIVE' });
  } catch (err) {
    console.error('Quality release error:', err);
    res.status(500).json({ error: 'Failed quality release' });
  }
});

export default router;
