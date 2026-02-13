import rateLimit from 'express-rate-limit';
import { createAuditLog, getAuditContext } from './audit.js';
import { prisma } from './db.js';

const SYSTEM_ADMIN_ROLE = 'System Admin';
const ADMIN_ROLE = 'Admin';

/**
 * Require one of the given roles (by name). Used for system management.
 * Admin and System Admin are treated as full system access.
 */
export function requireSystemRole(...allowedRoles) {
  const set = new Set([...allowedRoles, SYSTEM_ADMIN_ROLE, ADMIN_ROLE]);
  return (req, res, next) => {
    const role = req.user?.roleName;
    if (!role || !set.has(role)) {
      return res.status(403).json({ error: 'Insufficient permissions for system management' });
    }
    next();
  };
}

/** Roles that can access system management (dashboard and sub-pages). */
export const SYSTEM_ACCESS_ROLES = ['System Admin', 'Admin', 'Quality Admin', 'Quality Manager'];

/**
 * Require a specific permission (code). System Admin and Admin bypass.
 * Checks req.user.permissions array (from Role.permissions).
 */
export function requireSystemPermission(permissionCode) {
  return (req, res, next) => {
    const roleName = req.user?.roleName;
    const permissions = req.user?.permissions || [];
    if (roleName === SYSTEM_ADMIN_ROLE || roleName === ADMIN_ROLE) return next();
    if (permissions.includes(permissionCode)) return next();
    return res.status(403).json({ error: `Missing permission: ${permissionCode}` });
  };
}

/**
 * Require at least one of the given permissions. System Admin and Admin bypass.
 */
export function requireAnySystemPermission(...permissionCodes) {
  return (req, res, next) => {
    const roleName = req.user?.roleName;
    const permissions = req.user?.permissions || [];
    if (roleName === SYSTEM_ADMIN_ROLE || roleName === ADMIN_ROLE) return next();
    const hasAny = permissionCodes.some((code) => permissions.includes(code));
    if (hasAny) return next();
    return res.status(403).json({ error: `Missing permission: one of [${permissionCodes.join(', ')}] required` });
  };
}

/**
 * Rate limiter for sensitive system actions (invite, reset password, lock/unlock).
 */
export const systemSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
});

/**
 * Helper to create audit log from request (user + context) and optional reason from body.
 */
export async function auditFromRequest(req, { action, entityType, entityId, beforeValue, afterValue, reason: bodyReason }) {
  const { ip, userAgent, requestId } = getAuditContext(req);
  const reason = bodyReason ?? req.body?.reason ?? null;
  await createAuditLog({
    userId: req.user.id,
    action,
    entityType,
    entityId,
    beforeValue,
    afterValue,
    reason,
    ip,
    userAgent,
    requestId,
  });
}

/**
 * Count users with the given role. Used to prevent removing last System Admin.
 */
export async function countUsersWithRole(roleName) {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) return 0;
  return prisma.user.count({
    where: {
      roleId: role.id,
      status: 'ACTIVE',
    },
  });
}
