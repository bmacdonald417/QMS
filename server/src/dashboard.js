import express from 'express';
import { prisma } from './db.js';

const router = express.Router();

// GET /api/dashboard/metrics
router.get('/metrics', async (_req, res) => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [documentsByStatus, pendingReviews, documentsNearingReview, historyForApproval] =
      await Promise.all([
        prisma.document.groupBy({
          by: ['status'],
          where: { status: { not: 'ARCHIVED' } },
          _count: { id: true },
        }),
        prisma.periodicReview.count({
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
        }),
        prisma.document.findMany({
          where: {
            status: 'EFFECTIVE',
            nextReviewDate: { lte: thirtyDaysFromNow, not: null },
          },
          select: {
            id: true,
            documentId: true,
            title: true,
            versionMajor: true,
            versionMinor: true,
            nextReviewDate: true,
          },
          orderBy: { nextReviewDate: 'asc' },
          take: 20,
        }),
        prisma.documentHistory.findMany({
          where: {
            action: { in: ['Quality Released'] },
            document: { status: 'EFFECTIVE' },
          },
          select: {
            documentId: true,
            action: true,
            timestamp: true,
          },
          orderBy: { timestamp: 'asc' },
        }),
      ]);

    const statusCounts = {
      DRAFT: 0,
      IN_REVIEW: 0,
      APPROVED: 0,
      EFFECTIVE: 0,
      OBSOLETE: 0,
      PENDING_APPROVAL: 0,
      PENDING_QUALITY_RELEASE: 0,
      ARCHIVED: 0,
    };
    for (const g of documentsByStatus) {
      statusCounts[g.status] = g._count.id;
    }

    const approvalTimes = [];
    const docEffective = new Map();
    for (const h of historyForApproval) {
      if (h.action === 'Quality Released' && h.timestamp) {
        docEffective.set(h.documentId, h.timestamp);
      }
    }
    const created = await prisma.documentHistory.findMany({
      where: { action: 'Created Draft' },
      select: { documentId: true, timestamp: true },
    });
    const docFirstDraft = new Map(created.map((c) => [c.documentId, c.timestamp]));
    for (const [docId, effectiveAt] of docEffective) {
      const draftAt = docFirstDraft.get(docId);
      if (draftAt) {
        const ms = new Date(effectiveAt) - new Date(draftAt);
        approvalTimes.push(ms);
      }
    }
    const averageApprovalTimeMs =
      approvalTimes.length > 0
        ? approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length
        : null;

    const overdueTrainingCount = await prisma.userTrainingRecord.count({
      where: {
        OR: [
          { status: 'OVERDUE' },
          {
            status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
            trainingModule: { dueDate: { lt: now } },
          },
        ],
      },
    });

    // CAPA metrics: open by status, overdue tasks, cycle time (open to closed)
    const [capaByStatus, capaOverdueTasks, capaClosedWithDates, changeByStatus, changeOverdueTasks] =
      await Promise.all([
        prisma.cAPA.groupBy({
          by: ['status'],
          where: { status: { notIn: ['CLOSED', 'CANCELLED', 'ARCHIVED'] } },
          _count: { id: true },
        }),
        prisma.capaTask.count({
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
            dueDate: { lt: now },
          },
        }),
        prisma.cAPA.findMany({
          where: { status: 'CLOSED', closedAt: { not: null } },
          select: { id: true, createdAt: true, closedAt: true },
        }),
        prisma.changeControl.groupBy({
          by: ['status'],
          where: { status: { notIn: ['CLOSED', 'CANCELLED', 'ARCHIVED'] } },
          _count: { id: true },
        }),
        prisma.changeControlTask.count({
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
            dueDate: { lt: now },
          },
        }),
      ]);

    const capaOpenByStatus = {};
    for (const g of capaByStatus) capaOpenByStatus[g.status] = g._count.id;
    const capaCycleTimes = capaClosedWithDates
      .filter((c) => c.createdAt && c.closedAt)
      .map((c) => new Date(c.closedAt) - new Date(c.createdAt));
    const averageCapaCycleTimeDays =
      capaCycleTimes.length > 0
        ? Math.round(
            capaCycleTimes.reduce((a, b) => a + b, 0) / capaCycleTimes.length / (1000 * 60 * 60 * 24)
          )
        : null;

    const changeOpenByStatus = {};
    for (const g of changeByStatus) changeOpenByStatus[g.status] = g._count.id;

    res.json({
      documentsByStatus: statusCounts,
      overdueTraining: overdueTrainingCount,
      pendingReviews,
      averageApprovalTimeDays: averageApprovalTimeMs != null ? Math.round(averageApprovalTimeMs / (1000 * 60 * 60 * 24)) : null,
      documentsNearingReview,
      capa: {
        openByStatus: capaOpenByStatus,
        overdueTasks: capaOverdueTasks,
        averageCycleTimeDays: averageCapaCycleTimeDays,
      },
      changeControl: {
        openByStatus: changeOpenByStatus,
        overdueTasks: changeOverdueTasks,
      },
    });
  } catch (err) {
    console.error('Dashboard metrics error:', err);
    res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});

export default router;
