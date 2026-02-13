import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditFromRequest } from '../systemMiddleware.js';
import { requireSystemRole, requireSystemPermission } from '../systemMiddleware.js';

const router = express.Router();

const updateSchema = z.object({
  requireForDocumentApproval: z.boolean().optional(),
  requireForCapaClosure: z.boolean().optional(),
  requireForTrainingSignOff: z.boolean().optional(),
});

// GET /api/system/esign
router.get(
  '/',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('auditlog:view'),
  async (_req, res) => {
    try {
      let config = await prisma.eSignConfig.findFirst();
      if (!config) {
        config = await prisma.eSignConfig.create({ data: {} });
      }
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load e-sign config' });
    }
  }
);

// PUT /api/system/esign
router.put(
  '/',
  requireSystemRole('System Admin', 'Admin'),
  requireSystemPermission('system:securitypolicy:update'),
  async (req, res) => {
    try {
      const body = updateSchema.parse(req.body);
      let config = await prisma.eSignConfig.findFirst();
      if (!config) {
        config = await prisma.eSignConfig.create({ data: {} });
      }
      const before = { ...config };
      const updated = await prisma.eSignConfig.update({
        where: { id: config.id },
        data: body,
      });
      await auditFromRequest(req, {
        action: 'ESIGN_CONFIG_UPDATED',
        entityType: 'ESignConfig',
        entityId: updated.id,
        beforeValue: before,
        afterValue: updated,
        reason: req.body.reason,
      });
      res.json({ config: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Failed to update e-sign config' });
    }
  }
);

export default router;
