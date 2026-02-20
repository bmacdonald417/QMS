import express from 'express';
import { prisma } from './db.js';

const router = express.Router();

const CAPA_TASK_ACTIVE = ['PENDING', 'IN_PROGRESS', 'OVERDUE'];
const CHANGE_TASK_ACTIVE = ['PENDING', 'IN_PROGRESS', 'OVERDUE'];

// GET /api/tasks — document assignments + CAPA tasks + change control tasks (unified shape)
router.get('/', async (req, res) => {
  try {
    const [assignments, capaTasks, changeTasks] = await Promise.all([
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
      prisma.changeControlTask.findMany({
        where: {
          assignedToId: req.user.id,
          status: { in: CHANGE_TASK_ACTIVE },
        },
        include: {
          changeControl: {
            select: {
              id: true,
              changeId: true,
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
      entityLabel: a.document.documentId,
      documentId: a.document.id,
      docId: a.document.documentId,
      title: a.document.title,
      documentStatus: a.document.status,
      dueDate: a.dueDate ?? null,
      link: `/documents/${a.document.id}`,
    }));

    const capaTaskItems = capaTasks.map((t) => ({
      type: 'CAPA_TASK',
      id: t.id,
      taskType: t.taskType,
      status: t.status,
      entityLabel: t.capa.capaId,
      capaId: t.capa.id,
      capaNumber: t.capa.capaId,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      link: `/capas/${t.capaId}`,
    }));

    const changeTaskItems = changeTasks.map((t) => ({
      type: 'CHANGE_TASK',
      id: t.id,
      taskType: t.taskType,
      status: t.status,
      entityLabel: t.changeControl.changeId,
      changeControlId: t.changeControl.id,
      changeId: t.changeControl.changeId,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      link: `/change-control/${t.changeControlId}`,
    }));

    res.json({ tasks: [...docTasks, ...capaTaskItems, ...changeTaskItems] });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/history — completed document approval/review assignments for current user
router.get('/history', async (req, res) => {
  try {
    const assignments = await prisma.documentAssignment.findMany({
      where: {
        assignedToId: req.user.id,
        status: 'COMPLETED',
        assignmentType: { in: ['REVIEW', 'APPROVAL', 'QUALITY_RELEASE'] },
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
      orderBy: { completedAt: 'desc' },
      take: 100,
    });
    const items = assignments.map((a) => ({
      type: 'DOCUMENT_ASSIGNMENT',
      id: a.id,
      taskType: a.assignmentType,
      status: a.status,
      entityLabel: a.document.documentId,
      documentId: a.document.id,
      docId: a.document.documentId,
      title: a.document.title,
      documentStatus: a.document.status,
      completedAt: a.completedAt,
      link: `/documents/${a.document.id}`,
    }));
    res.json({ history: items });
  } catch (err) {
    console.error('List task history error:', err);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

export default router;
