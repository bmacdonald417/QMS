import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditFromRequest } from '../systemMiddleware.js';
import { requireSystemRole, requireSystemPermission } from '../systemMiddleware.js';

const router = express.Router();

const updateSchema = z.object({
  auditLogRetentionYears: z.number().int().min(1).max(30).optional(),
  documentRetentionYears: z.number().int().min(1).max(50).nullable().optional(),
  trainingRetentionYears: z.number().int().min(1).max(50).nullable().optional(),
  capaRetentionYears: z.number().int().min(1).max(50).nullable().optional(),
  changeRetentionYears: z.number().int().min(1).max(50).nullable().optional(),
});

// GET /api/system/retention
router.get(
  '/',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('auditlog:view'),
  async (_req, res) => {
    try {
      let policy = await prisma.retentionPolicy.findFirst();
      if (!policy) {
        policy = await prisma.retentionPolicy.create({ data: {} });
      }
      res.json({ policy });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load retention policy' });
    }
  }
);

// PUT /api/system/retention
router.put(
  '/',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('system:securitypolicy:update'),
  async (req, res) => {
    try {
      const body = updateSchema.parse(req.body);
      let policy = await prisma.retentionPolicy.findFirst();
      if (!policy) {
        policy = await prisma.retentionPolicy.create({ data: {} });
      }
      const before = { ...policy };
      const updated = await prisma.retentionPolicy.update({
        where: { id: policy.id },
        data: body,
      });
      await auditFromRequest(req, {
        action: 'RETENTION_POLICY_UPDATED',
        entityType: 'RetentionPolicy',
        entityId: updated.id,
        beforeValue: before,
        afterValue: updated,
        reason: req.body.reason,
      });
      res.json({ policy: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Failed to update retention policy' });
    }
  }
);

// GET /api/system/retention/last-backup - stub
router.get(
  '/last-backup',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  async (_req, res) => {
    res.json({ lastBackupTime: null, message: 'Backup integration not configured. Configure your backup job and expose an endpoint to report last backup time.' });
  }
);

export default router;
