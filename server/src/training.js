import express from 'express';
import { prisma } from './db.js';
import { requirePermission } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';

const router = express.Router();

/** Helper: audit integration key usage. Requires req.auditUserId (from trainingAuthMiddleware). */
async function auditIntegrationTrainingRead(req, { route, queryParams, recordCount }) {
  const auditUserId = req.auditUserId;
  if (!auditUserId) return; // No audit user configured
  const { ip, userAgent, requestId } = getAuditContext(req);
  await createAuditLog({
    userId: auditUserId,
    action: 'QMS_INTEGRATION_TRAINING_READ',
    entityType: 'Integration',
    entityId: null,
    beforeValue: null,
    afterValue: {
      actor: 'integration',
      route,
      queryParams: queryParams || {},
      recordCount: recordCount ?? null,
    },
    reason: null,
    ip,
    userAgent,
    requestId,
  });
}

// GET /api/training/modules
router.get('/modules', async (req, res) => {
  try {
    const modules = await prisma.trainingModule.findMany({
      include: {
        document: {
          select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (req.trainingActor === 'integration') {
      await auditIntegrationTrainingRead(req, {
        route: '/api/training/modules',
        queryParams: req.query,
        recordCount: modules.length,
      });
    }
    res.json({ modules });
  } catch (err) {
    console.error('List training modules error:', err);
    res.status(500).json({ error: 'Failed to list training modules' });
  }
});

// GET /api/training/my-assignments — requires JWT (user-specific)
router.get('/my-assignments', async (req, res) => {
  if (req.trainingActor === 'integration') {
    return res.status(403).json({ error: 'Use /assignments?employee_id= for integration access' });
  }
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

// GET /api/training/assignments — optional ?employee_id= (userId) for integration
router.get('/assignments', async (req, res) => {
  try {
    const employeeId = req.query.employee_id?.trim() || null;
    const where = employeeId ? { userId: employeeId } : {};
    const records = await prisma.userTrainingRecord.findMany({
      where,
      include: {
        trainingModule: {
          include: {
            document: {
              select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true },
            },
          },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
    if (req.trainingActor === 'integration') {
      await auditIntegrationTrainingRead(req, {
        route: '/api/training/assignments',
        queryParams: { employee_id: employeeId || undefined },
        recordCount: records.length,
      });
    }
    res.json({ assignments: records });
  } catch (err) {
    console.error('List training assignments error:', err);
    res.status(500).json({ error: 'Failed to list training assignments' });
  }
});

// GET /api/training/completions — optional ?employee_id= (userId) for integration
router.get('/completions', async (req, res) => {
  try {
    const employeeId = req.query.employee_id?.trim() || null;
    const where = { status: 'COMPLETED' };
    if (employeeId) where.userId = employeeId;
    const records = await prisma.userTrainingRecord.findMany({
      where,
      include: {
        trainingModule: {
          include: {
            document: {
              select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true },
            },
          },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { completionDate: 'desc' },
    });
    if (req.trainingActor === 'integration') {
      await auditIntegrationTrainingRead(req, {
        route: '/api/training/completions',
        queryParams: { employee_id: employeeId || undefined },
        recordCount: records.length,
      });
    }
    res.json({ completions: records });
  } catch (err) {
    console.error('List training completions error:', err);
    res.status(500).json({ error: 'Failed to list training completions' });
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
