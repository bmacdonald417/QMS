import express from 'express';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { prisma } from './db.js';
import { requirePermission, requireRoles } from './auth.js';
import { generateDocumentPdf } from './pdf.js';

const router = express.Router();

const DOC_TYPE_PREFIX = {
  SOP: 'SOP',
  POLICY: 'POL',
  WORK_INSTRUCTION: 'WIP',
  FORM: 'FRM',
  OTHER: 'DOC',
};

function normalizeDocumentType(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replaceAll(' ', '_').replaceAll('-', '_');
  const aliasMap = {
    POL: 'POLICY',
    WIP: 'WORK_INSTRUCTION',
    WORKINSTRUCTION: 'WORK_INSTRUCTION',
  };
  const mapped = aliasMap[normalized] || normalized;
  if (!Object.keys(DOC_TYPE_PREFIX).includes(mapped)) return null;
  return mapped;
}

function normalizeReviewDecision(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replaceAll(' ', '_').replaceAll('-', '_');
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
  await prisma.documentHistory.create({
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

function hasPermission(user, permission) {
  if (user?.roleName === 'Admin') return true;
  return (user?.permissions || []).includes(permission);
}

export async function generateDocumentId(documentType) {
  const prefix = DOC_TYPE_PREFIX[documentType] || 'DOC';
  const existing = await prisma.document.findMany({
    where: { documentType },
    select: { documentId: true },
  });
  let max = 0;
  for (const row of existing) {
    const match = row.documentId?.match(/-(\d+)$/);
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

// GET /api/documents/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        signatures: {
          include: { signer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { signedAt: 'asc' },
        },
      },
    });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const revisions = await prisma.documentRevision.findMany({
      where: { document: { documentId: document.documentId } },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: [{ versionMajor: 'asc' }, { versionMinor: 'asc' }, { createdAt: 'asc' }],
    });

    const uncontrolled =
      String(req.query.uncontrolled || '').toLowerCase() === 'true' ||
      String(req.query.mode || '').toLowerCase() === 'download';

    const pdf = await generateDocumentPdf({
      document,
      signatures: document.signatures,
      revisions,
      uncontrolled,
    });
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);

    const filename = `${document.documentId}-v${document.versionMajor}.${document.versionMinor}.pdf`;
    const disposition = uncontrolled ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Generate PDF error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
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
            assignedTo: {
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
        revisions: {
          include: { author: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        signatures: {
          include: { signer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { signedAt: 'desc' },
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

// POST /api/documents
router.post('/', requirePermission('document.create'), async (req, res) => {
  try {
    const { title, documentType, content, summaryOfChange } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    const normalizedType = normalizeDocumentType(documentType || 'OTHER');
    if (!normalizedType) {
      return res.status(400).json({ error: 'Invalid documentType' });
    }

    const generatedDocumentId = await generateDocumentId(normalizedType);
    const created = await prisma.document.create({
      data: {
        documentId: generatedDocumentId,
        title: title.trim(),
        documentType: normalizedType,
        versionMajor: 1,
        versionMinor: 0,
        status: 'DRAFT',
        content: typeof content === 'string' ? content : '',
        authorId: req.user.id,
        revisions: {
          create: {
            versionMajor: 1,
            versionMinor: 0,
            effectiveDate: new Date(),
            authorId: req.user.id,
            summaryOfChange:
              typeof summaryOfChange === 'string' && summaryOfChange.trim()
                ? summaryOfChange.trim()
                : 'Initial draft creation',
          },
        },
      },
    });

    await createHistory({
      documentId: created.id,
      userId: req.user.id,
      action: 'Created Draft',
      details: {
        documentId: created.documentId,
        version: `${created.versionMajor}.${created.versionMinor}`,
      },
    });

    res.status(201).json({ document: created });
  } catch (err) {
    console.error('Create document error:', err);
    res.status(500).json({ error: 'Failed to create draft document' });
  }
});

// PUT /api/documents/:id
router.put('/:id', requirePermission('document.create'), async (req, res) => {
  try {
    const { title, content, documentType } = req.body;
    const existing = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the author can update the document' });
    }
    if (!['DRAFT', 'IN_REVIEW'].includes(existing.status)) {
      return res.status(400).json({ error: 'Document can only be updated in Draft or In Review status' });
    }

    const updateData = {};
    if (typeof title === 'string') updateData.title = title.trim();
    if (typeof content === 'string') updateData.content = content;
    if (typeof documentType === 'string') {
      const normalizedType = normalizeDocumentType(documentType);
      if (!normalizedType) return res.status(400).json({ error: 'Invalid documentType' });
      updateData.documentType = normalizedType;
    }

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await createHistory({
      documentId: updated.id,
      userId: req.user.id,
      action: 'Updated Document',
      details: { fields: Object.keys(updateData) },
    });

    res.json({ document: updated });
  } catch (err) {
    console.error('Update document error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

async function submitForReviewHandler(req, res) {
  try {
    const { reviewerIds = [], approverId, comments, dueDate } = req.body;
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
      return res.status(400).json({ error: 'Only Draft documents can be submitted for review' });
    }

    const uniqueReviewers = [...new Set(reviewerIds.filter(Boolean))].filter((id) => id !== req.user.id);
    if (!uniqueReviewers.length) {
      return res.status(400).json({ error: 'At least one reviewer is required' });
    }

    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    const dueDateValue =
      parsedDueDate && Number.isFinite(parsedDueDate.valueOf()) ? parsedDueDate : null;

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: { status: 'IN_REVIEW' },
      });
      await tx.documentAssignment.deleteMany({
        where: { documentId: document.id, status: 'PENDING' },
      });
      await tx.documentAssignment.createMany({
        data: uniqueReviewers.map((assignedToId) => ({
          documentId: document.id,
          assignedToId,
          assignmentType: 'REVIEW',
          status: 'PENDING',
          dueDate: dueDateValue,
        })),
      });
      await tx.documentAssignment.create({
        data: {
          documentId: document.id,
          assignedToId: approverId,
          assignmentType: 'APPROVAL',
          status: 'PENDING',
          dueDate: dueDateValue,
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

    await createNotifications(
      [...uniqueReviewers, approverId],
      `You have been assigned to process document ${document.documentId}.`,
      `/documents/${document.id}`
    );

    res.json({ ok: true, status: 'IN_REVIEW' });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ error: 'Failed to submit document for review' });
  }
}

// POST /api/documents/:id/submit-review
router.post('/:id/submit-review', requirePermission('document.create'), submitForReviewHandler);

// Backward-compatible alias
router.post('/:id/submit', requirePermission('document.create'), submitForReviewHandler);

// POST /api/documents/:id/review
router.post('/:id/review', requirePermission('document.review'), async (req, res) => {
  try {
    const { decision, comments } = req.body;
    const normalizedDecision = normalizeReviewDecision(decision);
    if (!normalizedDecision) return res.status(400).json({ error: 'Invalid review decision' });

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const assignment = await prisma.documentAssignment.findFirst({
      where: {
        documentId: document.id,
        assignedToId: req.user.id,
        assignmentType: 'REVIEW',
        status: 'PENDING',
      },
    });
    if (!assignment) return res.status(403).json({ error: 'No pending review assignment found' });

    if (normalizedDecision === 'REQUIRES_REVISION') {
      await prisma.$transaction(async (tx) => {
        await tx.documentAssignment.update({
          where: { id: assignment.id },
          data: { status: 'REJECTED', completedAt: new Date(), comments: comments || null },
        });
        await tx.documentAssignment.updateMany({
          where: { documentId: document.id, status: 'PENDING' },
          data: { status: 'REJECTED', completedAt: new Date() },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { status: 'DRAFT' },
        });
        await tx.documentHistory.create({
          data: {
            documentId: document.id,
            userId: req.user.id,
            action: 'Review Rejected',
            details: { comments: comments || null },
          },
        });
      });

      await createNotifications(
        [document.authorId],
        `Document ${document.documentId} requires revision.`,
        `/documents/${document.id}`
      );
      return res.json({ ok: true, status: 'DRAFT' });
    }

    await prisma.documentAssignment.update({
      where: { id: assignment.id },
      data: { status: 'COMPLETED', completedAt: new Date(), comments: comments || null },
    });
    await createHistory({
      documentId: document.id,
      userId: req.user.id,
      action: 'Review Completed',
      details: { comments: comments || null },
    });

    const pendingReviewCount = await prisma.documentAssignment.count({
      where: { documentId: document.id, assignmentType: 'REVIEW', status: 'PENDING' },
    });
    if (pendingReviewCount === 0) {
      const approvers = await prisma.documentAssignment.findMany({
        where: {
          documentId: document.id,
          assignmentType: 'APPROVAL',
          status: 'PENDING',
        },
        select: { assignedToId: true },
      });
      await createNotifications(
        approvers.map((a) => a.assignedToId),
        `Document ${document.documentId} is ready for approval.`,
        `/documents/${document.id}`
      );
      await createHistory({
        documentId: document.id,
        userId: req.user.id,
        action: 'All Reviews Completed',
      });
    }

    res.json({ ok: true, status: document.status });
  } catch (err) {
    console.error('Review document error:', err);
    res.status(500).json({ error: 'Failed to complete review' });
  }
});

// POST /api/documents/:id/approve
router.post(
  '/:id/approve',
  requireRoles('Manager', 'Quality Manager', 'Admin'),
  requirePermission('document.approve'),
  async (req, res) => {
    try {
      const { password, comments } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password is required for digital signature' });
      }

      const document = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!document) return res.status(404).json({ error: 'Document not found' });
      if (document.status !== 'IN_REVIEW') {
        return res.status(400).json({ error: 'Document is not in review' });
      }

      if (req.user.roleName === 'Manager' && document.authorId === req.user.id) {
        return res.status(403).json({ error: 'Manager cannot approve their own document' });
      }

      const approvalAssignment = await prisma.documentAssignment.findFirst({
        where: {
          documentId: document.id,
          assignedToId: req.user.id,
          assignmentType: 'APPROVAL',
          status: 'PENDING',
        },
      });
      if (!approvalAssignment) {
        return res.status(403).json({ error: 'No pending approval assignment found' });
      }

      const pendingReviews = await prisma.documentAssignment.count({
        where: { documentId: document.id, assignmentType: 'REVIEW', status: 'PENDING' },
      });
      if (pendingReviews > 0) {
        return res.status(400).json({ error: 'All reviewers must complete review before approval' });
      }

      const signer = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { password: true },
      });
      const passwordOk = signer ? await bcrypt.compare(password, signer.password) : false;
      if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });

      const now = new Date();
      const documentHash = sha256(document.content || '');
      const passwordHash = await bcrypt.hash(password, 10);
      const signaturePayload = {
        documentId: document.id,
        signerId: req.user.id,
        signatureMeaning: 'Approver',
        signedAt: now.toISOString(),
        documentHash,
      };
      const signatureHash = sha256(JSON.stringify(signaturePayload));

      await prisma.$transaction(async (tx) => {
        await tx.documentAssignment.update({
          where: { id: approvalAssignment.id },
          data: { status: 'COMPLETED', completedAt: now, comments: comments || null },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { status: 'APPROVED' },
        });
        const signature = await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: req.user.id,
            signatureMeaning: 'Approver',
            signedAt: now,
            documentHash,
            signatureHash,
            passwordHash,
          },
        });
        await tx.documentHistory.create({
          data: {
            documentId: document.id,
            userId: req.user.id,
            action: 'Approved',
            details: { comments: comments || null },
            digitalSignature: {
              signatureId: signature.id,
              signatureMeaning: 'Approver',
              documentHash,
              signatureHash,
              signedAt: now.toISOString(),
            },
          },
        });

        const qualityUsers = await tx.user.findMany({
          where: { role: { name: 'Quality Manager' } },
          select: { id: true },
        });
        for (const qualityUser of qualityUsers) {
          const existing = await tx.documentAssignment.findFirst({
            where: {
              documentId: document.id,
              assignedToId: qualityUser.id,
              assignmentType: 'QUALITY_RELEASE',
              status: 'PENDING',
            },
          });
          if (!existing) {
            await tx.documentAssignment.create({
              data: {
                documentId: document.id,
                assignedToId: qualityUser.id,
                assignmentType: 'QUALITY_RELEASE',
                status: 'PENDING',
              },
            });
          }
        }
      });

      const qualityUsers = await prisma.user.findMany({
        where: { role: { name: 'Quality Manager' } },
        select: { id: true },
      });
      await createNotifications(
        qualityUsers.map((u) => u.id),
        `Document ${document.documentId} is pending quality release.`,
        `/documents/${document.id}`
      );

      res.json({ ok: true, status: 'APPROVED' });
    } catch (err) {
      console.error('Approve document error:', err);
      res.status(500).json({ error: 'Failed to approve document' });
    }
  }
);

async function qualityReleaseHandler(req, res) {
  try {
    const { password, comments } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required for digital signature' });
    }

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Document must be Approved before quality release' });
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
        assignedToId: req.user.id,
        assignmentType: 'QUALITY_RELEASE',
        status: 'PENDING',
      },
    });
    if (!qualityAssignment && req.user.roleName !== 'Admin') {
      return res.status(403).json({ error: 'No pending quality release assignment found' });
    }

    const now = new Date();
    const documentHash = sha256(document.content || '');
    const passwordHash = await bcrypt.hash(password, 10);
    const signaturePayload = {
      documentId: document.id,
      signerId: req.user.id,
      signatureMeaning: 'Quality Release',
      signedAt: now.toISOString(),
      documentHash,
    };
    const signatureHash = sha256(JSON.stringify(signaturePayload));

    await prisma.$transaction(async (tx) => {
      if (qualityAssignment) {
        await tx.documentAssignment.update({
          where: { id: qualityAssignment.id },
          data: { status: 'COMPLETED', completedAt: now, comments: comments || null },
        });
      }
      await tx.document.update({
        where: { id: document.id },
        data: { status: 'EFFECTIVE', effectiveDate: now },
      });
      await tx.document.updateMany({
        where: {
          documentId: document.documentId,
          id: { not: document.id },
          status: 'EFFECTIVE',
        },
        data: { status: 'OBSOLETE' },
      });
      await tx.documentSignature.create({
        data: {
          documentId: document.id,
          signerId: req.user.id,
          signatureMeaning: 'Quality Release',
          signedAt: now,
          documentHash,
          signatureHash,
          passwordHash,
        },
      });
      await tx.documentRevision.updateMany({
        where: { documentId: document.id },
        data: { effectiveDate: now },
      });
      await tx.documentHistory.create({
        data: {
          documentId: document.id,
          userId: req.user.id,
          action: 'Quality Released',
          details: { comments: comments || null },
          digitalSignature: {
            signatureMeaning: 'Quality Release',
            documentHash,
            signatureHash,
            signedAt: now.toISOString(),
          },
        },
      });
    });

    const allUsers = await prisma.user.findMany({ select: { id: true } });
    await createNotifications(
      allUsers.map((u) => u.id),
      `Document ${document.documentId} is now effective.`,
      `/documents/${document.id}`
    );

    res.json({ ok: true, status: 'EFFECTIVE' });
  } catch (err) {
    console.error('Quality release error:', err);
    res.status(500).json({ error: 'Failed quality release' });
  }
}

// POST /api/documents/:id/quality-release
router.post(
  '/:id/quality-release',
  requireRoles('Quality Manager', 'Admin'),
  requirePermission('document.release'),
  qualityReleaseHandler
);

// Backward-compatible alias
router.post(
  '/:id/release',
  requireRoles('Quality Manager', 'Admin'),
  requirePermission('document.release'),
  qualityReleaseHandler
);

// POST /api/documents/:id/revise
router.post('/:id/revise', requirePermission('document.create'), async (req, res) => {
  try {
    const { revisionType, summaryOfChange } = req.body;
    const normalized = typeof revisionType === 'string' ? revisionType.trim().toLowerCase() : '';
    if (!['major', 'minor'].includes(normalized)) {
      return res.status(400).json({ error: 'revisionType must be "major" or "minor"' });
    }

    const permission =
      normalized === 'major' ? 'document.revise.major' : 'document.revise.minor';
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }

    const source = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ error: 'Document not found' });
    if (source.status !== 'EFFECTIVE') {
      return res.status(400).json({ error: 'Only effective documents can be revised' });
    }

    const nextMajor = normalized === 'major' ? source.versionMajor + 1 : source.versionMajor;
    const nextMinor = normalized === 'major' ? 0 : source.versionMinor + 1;

    const revisedDraft = await prisma.document.create({
      data: {
        documentId: source.documentId,
        title: source.title,
        documentType: source.documentType,
        versionMajor: nextMajor,
        versionMinor: nextMinor,
        status: 'DRAFT',
        content: source.content || '',
        authorId: req.user.id,
        supersedesDocumentId: source.id,
        revisions: {
          create: {
            versionMajor: nextMajor,
            versionMinor: nextMinor,
            effectiveDate: source.effectiveDate || new Date(),
            authorId: req.user.id,
            summaryOfChange:
              typeof summaryOfChange === 'string' && summaryOfChange.trim()
                ? summaryOfChange.trim()
                : `${normalized === 'major' ? 'Major' : 'Minor'} revision from ${source.versionMajor}.${source.versionMinor}`,
          },
        },
      },
    });

    await createHistory({
      documentId: revisedDraft.id,
      userId: req.user.id,
      action: 'Revision Created',
      details: {
        revisionType: normalized,
        previousDocumentInternalId: source.id,
        previousVersion: `${source.versionMajor}.${source.versionMinor}`,
        newVersion: `${revisedDraft.versionMajor}.${revisedDraft.versionMinor}`,
      },
    });

    res.status(201).json({ document: revisedDraft });
  } catch (err) {
    console.error('Revise document error:', err);
    res.status(500).json({ error: 'Failed to create revised document' });
  }
});

export default router;
