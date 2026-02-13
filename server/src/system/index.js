import express from 'express';
import { authMiddleware } from '../auth.js';
import { requestIdMiddleware } from '../audit.js';
import { requireSystemRole } from '../systemMiddleware.js';
import usersRouter from './users.js';
import rolesRouter from './roles.js';
import auditRouter from './audit.js';
import securityPoliciesRouter from './securityPolicies.js';
import referenceRouter from './reference.js';
import retentionRouter from './retention.js';
import esignRouter from './esign.js';

const router = express.Router();

router.use(requestIdMiddleware);
router.use(authMiddleware);
router.use('/users', usersRouter);
router.use('/roles', rolesRouter);
router.use('/audit', auditRouter);
router.use('/security-policies', securityPoliciesRouter);
router.use('/reference', referenceRouter);
router.use('/retention', retentionRouter);
router.use('/esign', esignRouter);

// Dashboard summary for System Management landing
router.get('/dashboard', requireSystemRole('System Admin', 'Quality Manager', 'Manager'), async (req, res) => {
  try {
    const { prisma } = await import('../db.js');
    const [userCount, roleCount, auditCount] = await Promise.all([
      prisma.user.count(),
      prisma.role.count(),
      prisma.auditLog.count(),
    ]);
    res.json({
      userCount,
      roleCount,
      auditCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
