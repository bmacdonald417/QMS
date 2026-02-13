import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';

/**
 * Create an append-only audit log entry. Never update or delete from application code.
 * @param {object} opts
 * @param {string} opts.userId - Acting user id
 * @param {string} opts.action - e.g. USER_CREATED, USER_DEACTIVATED
 * @param {string} opts.entityType - e.g. User, Role, SecurityPolicy
 * @param {string|null} opts.entityId
 * @param {object|null} opts.beforeValue - Snapshot before change
 * @param {object|null} opts.afterValue - Snapshot after change
 * @param {string|null} opts.reason - Reason for change (required for sensitive actions)
 * @param {string|null} opts.ip
 * @param {string|null} opts.userAgent
 * @param {string|null} opts.requestId
 */
export async function createAuditLog({
  userId,
  action,
  entityType,
  entityId = null,
  beforeValue = null,
  afterValue = null,
  reason = null,
  ip = null,
  userAgent = null,
  requestId = null,
}) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      beforeValue: beforeValue ?? undefined,
      afterValue: afterValue ?? undefined,
      reason,
      ip,
      userAgent,
      requestId,
    },
  });
}

/**
 * Attach requestId to req and res. Call early in middleware chain.
 */
export function requestIdMiddleware(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

/**
 * Get IP and User-Agent from request for audit.
 */
export function getAuditContext(req) {
  const ip = req.ip || req.socket?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
  const userAgent = req.get('user-agent') || null;
  const requestId = req.requestId || null;
  return { ip, userAgent, requestId };
}
