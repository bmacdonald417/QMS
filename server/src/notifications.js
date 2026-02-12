import express from 'express';
import { prisma } from './db.js';

const router = express.Router();

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      data: { isRead: true },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Read notification error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

export default router;
