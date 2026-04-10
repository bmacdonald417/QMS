import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';

/**
 * Create an append-only audit log entry. Never update or delete from application code.
 * @param {object} opts
 * @param {string|null} opts.userId - Acting user id (when actorType=USER)
 * @param {string} [opts.actorType='USER'] - USER or INTEGRATION
 * @param {string|null} opts.actorId - For INTEGRATION: clientId
 * @param {object|null} opts.integration - When present: actorType=INTEGRATION, actorId=clientId, scopesUsed in afterValue
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
  userId = null,
  actorType = 'USER',
  actorId = null,
  integration = null,
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
  let finalUserId = userId;
  let finalActorType = actorType;
  let finalActorId = actorId;
  let finalAfterValue = afterValue;

  if (integration) {
    finalActorType = 'INTEGRATION';
    finalActorId = integration.clientId;
    finalUserId = null;
    finalAfterValue = {
      ...(typeof afterValue === 'object' && afterValue !== null ? afterValue : {}),
      scopesUsed: integration.scopes || [],
    };
  }

  await prisma.auditLog.create({
    data: {
      userId: finalUserId ?? undefined,
      actorType: finalActorType,
      actorId: finalActorId ?? undefined,
      action,
      entityType,
      entityId,
      beforeValue: beforeValue ?? undefined,
      afterValue: finalAfterValue ?? undefined,
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
 * Build audit params from request (userId or integration).
 * Use with createAuditLog: await createAuditLog({ ...getAuditActorFromRequest(req), action, ... });
 */
export function getAuditActorFromRequest(req) {
  if (req.integration) {
    return { userId: null, integration: req.integration };
  }
  const uid = req.auditUserId ?? req.user?.id;
  return { userId: uid ?? undefined };
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
