import { prisma } from './db.js';

async function createNotifications(userIds, message, link) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, message, link })),
  });
}

export async function runPeriodicReviewScheduler() {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const documentsDue = await prisma.document.findMany({
      where: {
        status: 'EFFECTIVE',
        nextReviewDate: { lte: thirtyDaysFromNow, not: null },
      },
      select: { id: true, documentId: true, authorId: true, nextReviewDate: true },
    });

    for (const doc of documentsDue) {
      const existing = await prisma.periodicReview.findFirst({
        where: {
          documentId: doc.id,
          status: { in: ['PENDING', 'OVERDUE'] },
        },
      });
      if (existing) continue;

      const reviewDate = doc.nextReviewDate || now;
      const status = reviewDate < now ? 'OVERDUE' : 'PENDING';
      const review = await prisma.periodicReview.create({
        data: {
          documentId: doc.id,
          reviewDate,
          status,
          reviewerId: doc.authorId,
        },
      });
      await createNotifications(
        [doc.authorId],
        `Document ${doc.documentId} due for periodic review`,
        `/documents/${doc.id}`
      );
    }

    const overdueIds = await prisma.userTrainingRecord.findMany({
      where: {
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        trainingModule: { dueDate: { lt: now } },
      },
      select: { id: true },
    });
    if (overdueIds.length) {
      await prisma.userTrainingRecord.updateMany({
        where: { id: { in: overdueIds.map((r) => r.id) } },
        data: { status: 'OVERDUE' },
      });
    }

    // CAPA tasks: mark overdue and notify
    const overdueCapaTasks = await prisma.capaTask.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { lt: now },
      },
      include: {
        capa: { select: { id: true, capaId: true, title: true, ownerId: true } },
        assignedTo: { select: { id: true } },
      },
    });
    for (const task of overdueCapaTasks) {
      await prisma.capaTask.update({
        where: { id: task.id },
        data: { status: 'OVERDUE' },
      });
      const notifyUserIds = [task.assignedToId, task.capa.ownerId].filter(Boolean);
      await createNotifications(
        [...new Set(notifyUserIds)],
        `CAPA task "${task.title}" on ${task.capa.capaId} is overdue.`,
        `/capas/${task.capa.id}`
      );
    }

    // CAPA retention: flag closed CAPAs eligible for archival (no hard delete)
    const retention = await prisma.retentionPolicy.findFirst();
    const capaRetentionYears = retention?.capaRetentionYears ?? 7;
    const archiveThreshold = new Date(now);
    archiveThreshold.setFullYear(archiveThreshold.getFullYear() - capaRetentionYears);
    await prisma.cAPA.updateMany({
      where: {
        status: 'CLOSED',
        closedAt: { lt: archiveThreshold },
        isArchived: false,
      },
      data: { isArchived: true },
    });
  } catch (err) {
    console.error('Periodic review scheduler error:', err);
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startPeriodicReviewScheduler() {
  runPeriodicReviewScheduler();
  setInterval(runPeriodicReviewScheduler, MS_PER_DAY);
}
