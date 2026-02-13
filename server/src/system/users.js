import express from 'express';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditFromRequest, countUsersWithRole } from '../systemMiddleware.js';
import { requireSystemRole, requireSystemPermission, requireAnySystemPermission, systemSensitiveLimiter } from '../systemMiddleware.js';
import {
  assertCanAssignRole,
  assertCanEditTarget,
  assertCanDeleteUser,
  getAllowedUpdateFields,
  canChangeRole,
} from '../userAuthz.js';

const SYSTEM_ADMIN_ROLE = 'System Admin';

const router = express.Router();

const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  departmentId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  jobTitle: z.string().max(200).optional().nullable(),
  roleId: z.number().int().positive(),
  temporaryPassword: z.string().min(8).optional(),
});

const inviteUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  departmentId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  jobTitle: z.string().max(200).optional().nullable(),
  roleId: z.number().int().positive(),
  expiryHours: z.number().int().min(1).max(168).default(72),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  jobTitle: z.string().max(200).optional().nullable(),
  roleId: z.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(),
  mfaEnabled: z.boolean().optional(),
});

const reasonSchema = z.object({ reason: z.string().min(1).max(2000) });

function sanitizeUser(u) {
  const { password, ...rest } = u;
  return rest;
}

// GET /api/system/users - list with search, filters, pagination, sort
router.get(
  '/',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:read'),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const skip = (page - 1) * limit;
      const search = (req.query.search || '').trim().toLowerCase();
      const roleId = req.query.roleId ? parseInt(req.query.roleId, 10) : null;
      const status = req.query.status || null;
      const departmentId = req.query.departmentId || null;
      const siteId = req.query.siteId || null;
      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

      const where = {};
      if (status) where.status = status;
      if (roleId) where.roleId = roleId;
      if (departmentId) where.departmentId = departmentId;
      if (siteId) where.siteId = siteId;
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const orderBy = { [sortBy]: sortOrder };
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            jobTitle: true,
            mfaEnabled: true,
            lastLoginAt: true,
            lockedAt: true,
            createdAt: true,
            roleId: true,
            departmentId: true,
            siteId: true,
            role: { select: { id: true, name: true } },
            department: { select: { id: true, name: true, code: true } },
            site: { select: { id: true, name: true, code: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        users: users.map((u) => ({
          ...u,
          roleName: u.role?.name,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      console.error('System users list error:', err);
      res.status(500).json({ error: 'Failed to list users' });
    }
  }
);

// POST /api/system/users - create user (direct with temp password)
router.post(
  '/',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:create'),
  systemSensitiveLimiter,
  async (req, res) => {
    try {
      const body = createUserSchema.parse(req.body);
      const requestedRole = await prisma.role.findUnique({ where: { id: body.roleId } });
      if (!requestedRole) return res.status(400).json({ error: 'Invalid role' });
      try {
        assertCanAssignRole(req.user, requestedRole.name);
      } catch (e) {
        return res.status(e.statusCode || 403).json({ error: e.message });
      }

      const existing = await prisma.user.findUnique({ where: { email: body.email.trim() } });
      if (existing) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      const tempPassword = body.temporaryPassword || randomBytes(12).toString('base64').slice(0, 12);
      const hashed = await bcrypt.hash(tempPassword, 10);

      const user = await prisma.user.create({
        data: {
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          email: body.email.trim().toLowerCase(),
          password: hashed,
          roleId: body.roleId,
          departmentId: body.departmentId || undefined,
          siteId: body.siteId || undefined,
          jobTitle: body.jobTitle?.trim() || undefined,
          status: 'ACTIVE',
          mustChangePassword: true,
        },
        include: { role: true, department: true, site: true },
      });

      await auditFromRequest(req, {
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        afterValue: sanitizeUser(user),
        reason: req.body.reason,
      });

      res.status(201).json({
        user: sanitizeUser(user),
        temporaryPassword: body.temporaryPassword ? undefined : tempPassword,
      });
    } catch (err) {
      if (err.statusCode === 403) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0].message, details: err.errors });
      }
      console.error('System create user error:', err);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// POST /api/system/users/invite
router.post(
  '/invite',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:create'),
  systemSensitiveLimiter,
  async (req, res) => {
    try {
      const body = inviteUserSchema.parse(req.body);
      const existing = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
      if (existing) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + body.expiryHours);

      const invite = await prisma.inviteToken.create({
        data: {
          email: body.email.trim().toLowerCase(),
          tokenHash,
          expiresAt,
          createdById: req.user.id,
        },
      });

      await auditFromRequest(req, {
        action: 'USER_INVITED',
        entityType: 'InviteToken',
        entityId: invite.id,
        afterValue: { email: body.email, expiresAt, firstName: body.firstName, lastName: body.lastName, roleId: body.roleId },
        reason: req.body.reason,
      });

      res.status(201).json({
        inviteId: invite.id,
        email: body.email,
        expiresAt,
        inviteLink: `${process.env.APP_URL || 'http://localhost:5173'}/accept-invite?token=${token}`,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0].message });
      }
      console.error('System invite user error:', err);
      res.status(500).json({ error: 'Failed to create invite' });
    }
  }
);

// GET /api/system/users/assignable-roles - roles the current user can assign (for dropdown)
router.get(
  '/assignable-roles',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireAnySystemPermission('users:create', 'users:assign_roles:basic', 'users:assign_roles:any'),
  async (req, res) => {
    try {
      const { getAssignableRoleNames } = await import('../userAuthz.js');
      const allowedNames = getAssignableRoleNames(req.user?.roleName);
      if (allowedNames === null) {
        const all = await prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
        return res.json({ roles: all });
      }
      const roles = await prisma.role.findMany({
        where: { name: { in: allowedNames } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      res.json({ roles });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load assignable roles' });
    }
  }
);

// GET /api/system/users/:id
router.get(
  '/:id',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:read'),
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true, department: true, site: true },
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user: sanitizeUser(user) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
);

// PUT /api/system/users/:id
router.put(
  '/:id',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireAnySystemPermission('users:update', 'users:update:basic', 'users:update:compliance'),
  async (req, res) => {
    try {
      const body = updateUserSchema.parse(req.body);
      const existing = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true, department: true, site: true },
      });
      if (!existing) return res.status(404).json({ error: 'User not found' });

      try {
        assertCanEditTarget(req.user, existing);
      } catch (e) {
        return res.status(e.statusCode || 403).json({ error: e.message });
      }

      const allowedFields = getAllowedUpdateFields(req.user);
      const isRoleChange = body.roleId !== undefined && body.roleId !== existing.roleId;

      if (isRoleChange) {
        if (!canChangeRole(req.user)) {
          return res.status(403).json({ error: 'You do not have permission to change user roles.' });
        }
        const newRole = await prisma.role.findUnique({ where: { id: body.roleId } });
        if (!newRole) return res.status(400).json({ error: 'Invalid role' });
        try {
          assertCanAssignRole(req.user, newRole.name);
        } catch (e) {
          return res.status(e.statusCode || 403).json({ error: e.message });
        }
        if (existing.role?.name === SYSTEM_ADMIN_ROLE && newRole.name !== SYSTEM_ADMIN_ROLE) {
          const count = await countUsersWithRole(SYSTEM_ADMIN_ROLE);
          if (count <= 1) {
            return res.status(400).json({ error: 'Cannot remove the last System Admin. Assign System Admin to another user first.' });
          }
        }
      }

      const data = {};
      if (allowedFields.includes('firstName') && body.firstName !== undefined) data.firstName = body.firstName.trim();
      if (allowedFields.includes('lastName') && body.lastName !== undefined) data.lastName = body.lastName.trim();
      if (allowedFields.includes('departmentId')) data.departmentId = body.departmentId;
      if (allowedFields.includes('siteId')) data.siteId = body.siteId;
      if (allowedFields.includes('jobTitle')) data.jobTitle = body.jobTitle?.trim() || null;
      if (allowedFields.includes('status') && body.status !== undefined) data.status = body.status;
      if (allowedFields.includes('mfaEnabled') && body.mfaEnabled !== undefined) data.mfaEnabled = body.mfaEnabled;
      if (allowedFields.includes('roleId') && body.roleId !== undefined) data.roleId = body.roleId;

      const before = sanitizeUser(existing);
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data,
        include: { role: true, department: true, site: true },
      });

      const action = isRoleChange ? 'USER_ROLE_CHANGED' : 'USER_UPDATED';
      await auditFromRequest(req, {
        action,
        entityType: 'User',
        entityId: updated.id,
        beforeValue: before,
        afterValue: sanitizeUser(updated),
        reason: req.body.reason,
      });

      res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      if (err.statusCode === 403) return res.status(403).json({ error: err.message });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// DELETE /api/system/users/:id - soft-delete (set INACTIVE); sys_admin only
router.delete(
  '/:id',
  requireSystemRole('System Admin', 'Admin'),
  requireSystemPermission('users:delete'),
  systemSensitiveLimiter,
  async (req, res) => {
    try {
      try {
        assertCanDeleteUser(req.user);
      } catch (e) {
        return res.status(e.statusCode || 403).json({ error: e.message });
      }
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true, department: true, site: true },
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.role?.name === SYSTEM_ADMIN_ROLE) {
        const count = await countUsersWithRole(SYSTEM_ADMIN_ROLE);
        if (count <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last System Admin.' });
        }
      }
      const before = sanitizeUser(user);
      await prisma.user.update({
        where: { id: req.params.id },
        data: { status: 'INACTIVE', lockedAt: null },
      });
      const afterUser = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true, department: true, site: true },
      });
      await auditFromRequest(req, {
        action: 'USER_DELETED',
        entityType: 'User',
        entityId: user.id,
        beforeValue: before,
        afterValue: afterUser ? sanitizeUser(afterUser) : { status: 'INACTIVE' },
        reason: req.body?.reason,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err.statusCode === 403) return res.status(403).json({ error: err.message });
      console.error('System delete user error:', err);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

// POST /api/system/users/:id/deactivate
router.post(
  '/:id/deactivate',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:disable'),
  systemSensitiveLimiter,
  async (req, res) => {
    try {
      const { reason } = reasonSchema.parse(req.body);
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }
      const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      try {
        assertCanEditTarget(req.user, user);
      } catch (e) {
        return res.status(e.statusCode || 403).json({ error: e.message });
      }
      if (user.role?.name === SYSTEM_ADMIN_ROLE) {
        const count = await countUsersWithRole(SYSTEM_ADMIN_ROLE);
        if (count <= 1) {
          return res.status(400).json({ error: 'Cannot deactivate the last System Admin.' });
        }
      }
      const before = { status: user.status };
      await prisma.user.update({
        where: { id: req.params.id },
        data: { status: 'INACTIVE' },
      });
      await auditFromRequest(req, {
        action: 'USER_DEACTIVATED',
        entityType: 'User',
        entityId: user.id,
        beforeValue: before,
        afterValue: { status: 'INACTIVE' },
        reason,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err.statusCode === 403) return res.status(403).json({ error: err.message });
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Reason is required' });
      res.status(500).json({ error: 'Failed to deactivate user' });
    }
  }
);

// POST /api/system/users/:id/reactivate
router.post(
  '/:id/reactivate',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireAnySystemPermission('users:update', 'users:update:basic', 'users:update:compliance'),
  async (req, res) => {
    try {
      const { reason } = reasonSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      try {
        assertCanEditTarget(req.user, user);
      } catch (e) {
        return res.status(e.statusCode || 403).json({ error: e.message });
      }
      const before = { status: user.status };
      await prisma.user.update({
        where: { id: req.params.id },
        data: { status: 'ACTIVE', lockedAt: null },
      });
      await auditFromRequest(req, {
        action: 'USER_REACTIVATED',
        entityType: 'User',
        entityId: user.id,
        beforeValue: before,
        afterValue: { status: 'ACTIVE' },
        reason,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Reason is required' });
      res.status(500).json({ error: 'Failed to reactivate user' });
    }
  }
);

// POST /api/system/users/:id/lock
router.post(
  '/:id/lock',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:disable'),
  systemSensitiveLimiter,
  async (req, res) => {
    try {
      const { reason } = reasonSchema.parse(req.body);
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot lock your own account' });
      }
      const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      try {
        assertCanEditTarget(req.user, user);
      } catch (e) {
        return res.status(e.statusCode || 403).json({ error: e.message });
      }
      const now = new Date();
      await prisma.user.update({
        where: { id: req.params.id },
        data: { status: 'LOCKED', lockedAt: now },
      });
      await auditFromRequest(req, {
        action: 'USER_LOCKED',
        entityType: 'User',
        entityId: user.id,
        afterValue: { lockedAt: now },
        reason,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Reason is required' });
      res.status(500).json({ error: 'Failed to lock user' });
    }
  }
);

// POST /api/system/users/:id/unlock
router.post(
  '/:id/unlock',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireAnySystemPermission('users:update', 'users:update:basic', 'users:update:compliance'),
  async (req, res) => {
    try {
      const { reason } = reasonSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      try {
        assertCanEditTarget(req.user, user);
      } catch (e) {
        return res.status(e.statusCode || 403).json({ error: e.message });
      }
      await prisma.user.update({
        where: { id: req.params.id },
        data: { status: 'ACTIVE', lockedAt: null },
      });
      await auditFromRequest(req, {
        action: 'USER_UNLOCKED',
        entityType: 'User',
        entityId: user.id,
        reason,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Reason is required' });
      res.status(500).json({ error: 'Failed to unlock user' });
    }
  }
);

// POST /api/system/users/:id/revoke-sessions
router.post(
  '/:id/revoke-sessions',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:update'),
  systemSensitiveLimiter,
  async (req, res) => {
    try {
      const { reason } = reasonSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const newVersion = (user.tokenVersion ?? 0) + 1;
      await prisma.user.update({
        where: { id: req.params.id },
        data: { tokenVersion: newVersion },
      });
      await auditFromRequest(req, {
        action: 'USER_SESSIONS_REVOKED',
        entityType: 'User',
        entityId: user.id,
        afterValue: { tokenVersion: newVersion },
        reason,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Reason is required' });
      res.status(500).json({ error: 'Failed to revoke sessions' });
    }
  }
);

// POST /api/system/users/:id/reset-password - generate reset token (stub: returns link)
router.post(
  '/:id/reset-password',
  requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'),
  requireSystemPermission('users:update'),
  systemSensitiveLimiter,
  async (req, res) => {
    try {
      const { reason } = reasonSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      await auditFromRequest(req, {
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        reason,
      });
      res.json({
        resetLink: `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`,
        expiresAt,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Reason is required' });
      res.status(500).json({ error: 'Failed to create reset link' });
    }
  }
);

export default router;
