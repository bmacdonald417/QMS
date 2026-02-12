import express from 'express';
import { prisma } from './db.js';
import { requirePermission, requireRoles } from './auth.js';

const router = express.Router();

// GET /api/periodic-reviews/my-reviews
router.get('/my-reviews', async (req, res) => {
  try {
    const reviews = await prisma.periodicReview.findMany({
      where: { reviewerId: req.user.id },
      include: {
        document: {
          select: {
            id: true,
            documentId: true,
            title: true,
            versionMajor: true,
            versionMinor: true,
            nextReviewDate: true,
          },
        },
      },
      orderBy: { reviewDate: 'asc' },
    });
    res.json({ reviews });
  } catch (err) {
    console.error('List my periodic reviews error:', err);
    res.status(500).json({ error: 'Failed to list reviews' });
  }
});

// POST /api/periodic-reviews/complete/:reviewId
router.post(
  '/complete/:reviewId',
  requireRoles('Quality Manager', 'Admin', 'Manager'),
  requirePermission('document.review'),
  async (req, res) => {
    try {
      const reviewId = req.params.reviewId;
      const { nextReviewDate } = req.body;

      const review = await prisma.periodicReview.findUnique({
        where: { id: reviewId },
        include: { document: true },
      });
      if (!review) return res.status(404).json({ error: 'Review not found' });
      if (review.reviewerId !== req.user.id && req.user.roleName !== 'Admin') {
        return res.status(403).json({ error: 'You can only complete reviews assigned to you' });
      }

      const nextDate = nextReviewDate ? new Date(nextReviewDate) : new Date();
      if (!Number.isFinite(nextDate.valueOf())) {
        return res.status(400).json({ error: 'Invalid nextReviewDate' });
      }
      // Default: +1 year if not provided
      if (!nextReviewDate) {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      }

      await prisma.$transaction([
        prisma.periodicReview.update({
          where: { id: reviewId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        }),
        prisma.document.update({
          where: { id: review.documentId },
          data: { nextReviewDate: nextDate },
        }),
      ]);

      const updated = await prisma.periodicReview.findUnique({
        where: { id: reviewId },
        include: { document: true },
      });
      res.json({ review: updated });
    } catch (err) {
      console.error('Complete periodic review error:', err);
      res.status(500).json({ error: 'Failed to complete review' });
    }
  }
);

export default router;
