import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditFromRequest } from '../systemMiddleware.js';
import { requireSystemRole, requireSystemPermission } from '../systemMiddleware.js';

const router = express.Router();

const updatePolicySchema = z.object({
  passwordMinLength: z.number().int().min(6).max(32).optional(),
  passwordRequireUppercase: z.boolean().optional(),
  passwordRequireLowercase: z.boolean().optional(),
  passwordRequireNumber: z.boolean().optional(),
  passwordRequireSpecial: z.boolean().optional(),
  passwordHistoryCount: z.number().int().min(0).max(24).optional(),
  passwordMaxAgeDays: z.number().int().min(0).nullable().optional(),
  lockoutThreshold: z.number().int().min(0).max(20).optional(),
  lockoutDurationMinutes: z.number().int().min(0).max(1440).optional(),
  sessionIdleTimeoutMinutes: z.number().int().min(1).max(480).optional(),
  sessionMaxDurationMinutes: z.number().int().min(1).max(10080).optional(),
  mfaPolicy: z.enum(['OFF', 'OPTIONAL', 'REQUIRED']).optional(),
  allowedDomains: z.array(z.string()).optional(),
});

// GET /api/system/security-policies
router.get(
  '/',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('auditlog:view'),
  async (_req, res) => {
    try {
      let policy = await prisma.securityPolicy.findFirst();
      if (!policy) {
        policy = await prisma.securityPolicy.create({
          data: {},
        });
      }
      res.json({ policy });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load security policy' });
    }
  }
);

// PUT /api/system/security-policies
router.put(
  '/',
  requireSystemRole('System Admin', 'Admin'),
  requireSystemPermission('system:securitypolicy:update'),
  async (req, res) => {
    try {
      const body = updatePolicySchema.parse(req.body);
      let policy = await prisma.securityPolicy.findFirst();
      if (!policy) {
        policy = await prisma.securityPolicy.create({ data: {} });
      }
      const before = { ...policy };
      const updated = await prisma.securityPolicy.update({
        where: { id: policy.id },
        data: body,
      });
      await auditFromRequest(req, {
        action: 'SECURITY_POLICY_UPDATED',
        entityType: 'SecurityPolicy',
        entityId: updated.id,
        beforeValue: before,
        afterValue: updated,
        reason: req.body.reason,
      });
      res.json({ policy: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Failed to update security policy' });
    }
  }
);

export default router;
