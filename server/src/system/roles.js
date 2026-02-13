import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditFromRequest } from '../systemMiddleware.js';
import { requireSystemRole, requireSystemPermission, countUsersWithRole } from '../systemMiddleware.js';
import { getCanonicalRoleNames, getPermissionsForRole, isCanonicalRoleName } from '../rbac/roleCatalog.js';
import { isValidCode } from '../rbac/permissionCatalog.js';

const router = express.Router();
const SYSTEM_ADMIN = 'System Admin';

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default([]),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
});

// GET /api/system/roles — returns all roles; frontend filters to canonical and shows warning if any non-canonical
router.get(
  '/',
  requireSystemRole('System Admin', 'Quality Manager'),
  requireSystemPermission('auditlog:view'),
  async (_req, res) => {
    try {
      const roles = await prisma.role.findMany({
        include: { rolePermissions: { include: { permission: true } } },
        orderBy: { name: 'asc' },
      });
      const permissions = await prisma.permission.findMany({ orderBy: { code: 'asc' } });
      const canonicalNames = new Set(getCanonicalRoleNames());
      res.json({
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          isCanonical: canonicalNames.has(r.name),
          permissions: r.permissions,
          permissionDetails: r.rolePermissions?.map((rp) => rp.permission?.code).filter(Boolean) || [],
        })),
        permissions,
        canonicalRoleNames: getCanonicalRoleNames(),
      });
    } catch (err) {
      console.error('System roles list error:', err);
      res.status(500).json({ error: 'Failed to list roles' });
    }
  }
);

// GET /api/system/roles/permission-matrix — granted = role_permissions join (source of truth), fallback to Role.permissions
router.get(
  '/permission-matrix',
  requireSystemRole('System Admin', 'Quality Manager'),
  requireSystemPermission('auditlog:view'),
  async (_req, res) => {
    try {
      const [roles, permissions] = await Promise.all([
        prisma.role.findMany({ orderBy: { name: 'asc' } }),
        prisma.permission.findMany({ orderBy: { code: 'asc' } }),
      ]);
      const rolePerms = await prisma.rolePermission.findMany({
        where: { roleId: { in: roles.map((r) => r.id) } },
      });
      const set = new Set(rolePerms.map((rp) => `${rp.roleId}-${rp.permissionId}`));
      const matrix = roles.map((role) => ({
        roleId: role.id,
        roleName: role.name,
        permissions: permissions.map((p) => ({
          permissionId: p.id,
          code: p.code,
          granted: set.has(`${role.id}-${p.id}`) || role.permissions?.includes(p.code),
        })),
      }));
      res.json({ matrix, permissions, roles });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load permission matrix' });
    }
  }
);

// POST /api/system/roles — only canonical role names allowed; syncs role_permissions
router.post(
  '/',
  requireSystemRole('System Admin'),
  requireSystemPermission('system:securitypolicy:update'),
  async (req, res) => {
    try {
      const body = createRoleSchema.parse(req.body);
      const name = body.name.trim();
      if (!isCanonicalRoleName(name)) {
        return res.status(400).json({ error: 'Only canonical role names are allowed. Use one of: ' + getCanonicalRoleNames().join(', ') });
      }
      const existing = await prisma.role.findUnique({ where: { name } });
      if (existing) return res.status(400).json({ error: 'Role name already exists' });

      const codes = (body.permissions || []).filter(isValidCode);
      const role = await prisma.role.create({
        data: { name, permissions: codes },
      });
      const perms = await prisma.permission.findMany({ where: { code: { in: codes } } });
      for (const p of perms) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
      }
      await auditFromRequest(req, {
        action: 'ROLE_CREATED',
        entityType: 'Role',
        entityId: String(role.id),
        afterValue: { name: role.name, permissions: role.permissions },
        reason: req.body.reason,
      });
      res.status(201).json({ role });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
);

// PUT /api/system/roles/:id — syncs role_permissions; prevents removing last System Admin
router.put(
  '/:id',
  requireSystemRole('System Admin'),
  requireSystemPermission('system:securitypolicy:update'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid role id' });
      const body = updateRoleSchema.parse(req.body);
      const existing = await prisma.role.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Role not found' });

      if (body.name !== undefined && body.name.trim() !== existing.name && !isCanonicalRoleName(body.name.trim())) {
        return res.status(400).json({ error: 'Only canonical role names are allowed.' });
      }

      if (existing.name === SYSTEM_ADMIN && body.permissions !== undefined) {
        const count = await countUsersWithRole(SYSTEM_ADMIN);
        const fullSystemAdminPerms = getPermissionsForRole(SYSTEM_ADMIN);
        const requestedCodes = body.permissions.filter(isValidCode);
        if (count <= 1 && requestedCodes.length < fullSystemAdminPerms.length) {
          return res.status(400).json({ error: 'Cannot remove the last System Admin. Ensure another user has System Admin role first.' });
        }
      }

      const permissions = body.permissions !== undefined ? body.permissions.filter(isValidCode) : existing.permissions;
      const updated = await prisma.role.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.permissions !== undefined && { permissions }),
        },
      });

      if (body.permissions !== undefined) {
        await prisma.rolePermission.deleteMany({ where: { roleId: id } });
        const perms = await prisma.permission.findMany({ where: { code: { in: permissions } } });
        for (const p of perms) {
          await prisma.rolePermission.create({ data: { roleId: id, permissionId: p.id } });
        }
      }

      await auditFromRequest(req, {
        action: 'ROLE_UPDATED',
        entityType: 'Role',
        entityId: String(id),
        beforeValue: { name: existing.name, permissions: existing.permissions },
        afterValue: { name: updated.name, permissions: updated.permissions },
        reason: req.body.reason,
      });
      res.json({ role: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

export default router;
