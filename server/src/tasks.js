import express from 'express';
import { prisma } from './db.js';

const router = express.Router();

// GET /api/tasks (pending assignments for logged-in user)
router.get('/', async (req, res) => {
  try {
    const assignments = await prisma.documentAssignment.findMany({
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
    });

    const tasks = assignments.map((assignment) => ({
      id: assignment.id,
      taskType: assignment.assignmentType,
      status: assignment.status,
      documentId: assignment.document.id,
      docId: assignment.document.documentId,
      title: assignment.document.title,
      documentStatus: assignment.document.status,
      link: `/documents/${assignment.document.id}`,
    }));

    res.json({ tasks });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

export default router;
