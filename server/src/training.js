import express from 'express';
import { prisma } from './db.js';
import { requirePermission } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';

const router = express.Router();

// GET /api/training/modules
router.get('/modules', async (_req, res) => {
  try {
    const modules = await prisma.trainingModule.findMany({
      include: {
        document: {
          select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ modules });
  } catch (err) {
    console.error('List training modules error:', err);
    res.status(500).json({ error: 'Failed to list training modules' });
  }
});

// GET /api/training/my-assignments
router.get('/my-assignments', async (req, res) => {
  try {
    const records = await prisma.userTrainingRecord.findMany({
      where: { userId: req.user.id },
      include: {
        trainingModule: {
          include: {
            document: {
              select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
    res.json({ assignments: records });
  } catch (err) {
    console.error('List my training assignments error:', err);
    res.status(500).json({ error: 'Failed to list assignments' });
  }
});

// POST /api/training/complete/:assignmentId
router.post('/complete/:assignmentId', requirePermission('document:review'), async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;
    const record = await prisma.userTrainingRecord.findUnique({
      where: { id: assignmentId },
      include: { trainingModule: true },
    });
    if (!record) return res.status(404).json({ error: 'Assignment not found' });
    if (record.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only complete your own assignment' });
    }

    const updated = await prisma.userTrainingRecord.update({
      where: { id: assignmentId },
      data: { status: 'COMPLETED', completionDate: new Date() },
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'TRAINING_COMPLETED',
      entityType: 'UserTrainingRecord',
      entityId: record.id,
      beforeValue: { status: record.status },
      afterValue: { status: 'COMPLETED', completionDate: updated.completionDate },
      reason: req.body.reason || null,
      ...auditCtx,
    });

    res.json({ assignment: updated });
  } catch (err) {
    console.error('Complete training error:', err);
    res.status(500).json({ error: 'Failed to complete training' });
  }
});

export default router;
