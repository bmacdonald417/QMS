import express from 'express';
import { prisma } from './db.js';

const router = express.Router();

const CAPA_TASK_ACTIVE = ['PENDING', 'IN_PROGRESS', 'OVERDUE'];

// GET /api/tasks — document assignments + CAPA tasks for current user (unified shape)
router.get('/', async (req, res) => {
  try {
    const [assignments, capaTasks] = await Promise.all([
      prisma.documentAssignment.findMany({
        where: {
          assignedToId: req.user.id,
          status: 'PENDING',
        },
        include: {
          document: {
            select: {
              id: true,
              documentId: true,
              title: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.capaTask.findMany({
        where: {
          assignedToId: req.user.id,
          status: { in: CAPA_TASK_ACTIVE },
        },
        include: {
          capa: {
            select: {
              id: true,
              capaId: true,
              title: true,
              status: true,
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const docTasks = assignments.map((a) => ({
      type: 'DOCUMENT_ASSIGNMENT',
      id: a.id,
      taskType: a.assignmentType,
      status: a.status,
      documentId: a.document.id,
      docId: a.document.documentId,
      title: a.document.title,
      documentStatus: a.document.status,
      link: `/documents/${a.document.id}`,
    }));

    const capaTaskItems = capaTasks.map((t) => ({
      type: 'CAPA_TASK',
      id: t.id,
      taskType: t.taskType,
      status: t.status,
      capaId: t.capa.id,
      capaNumber: t.capa.capaId,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      link: `/capas/${t.capaId}`,
    }));

    res.json({ tasks: [...docTasks, ...capaTaskItems] });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

export default router;
