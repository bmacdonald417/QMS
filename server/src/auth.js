import express from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { prisma } from './db.js';
import {
  checkLegacyIntegrationKey,
  getIntegrationTokenFromRequest,
  verifyIntegrationToken,
} from './integrations/auth.js';
import {
  sendAuditLogAsync,
  shouldFireAuditOnce,
} from './mactechAuditClient.js';
import {
  checkIdentityAccess,
  findActiveAccessForApp,
} from './mactechIdentityClient.js';
import {
  mapIccRoleToQmsRole,
  INTERNAL_MACTECH_SENTINEL,
} from './lib/iccRoleMapping.js';

const QMS_APP_KEY = 'quality';

const router = express.Router();

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';
// Throttle: at most one quality.session.opened event per user per hour, per
// process. Across N replicas you may see up to N events per hour per user;
// that's acceptable noise for a session-level signal.
const AUDIT_SESSION_DEDUP_MS = 60 * 60 * 1000;

// Lazy because we need a secret key. Throws when first invoked without one.
let _clerk = null;
function clerk() {
  if (!_clerk) {
    if (!CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY not set on the QMS server.');
    }
    _clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  }
  return _clerk;
}

/**
 * POST /api/auth/login
 * Legacy email+password endpoint. Identity now comes from Clerk; the
 * frontend signs in at /sign-in and attaches a Clerk session token to API
 * requests. Returning 410 makes any straggler client surface a clear error.
 */
router.post('/login', (_req, res) => {
  res.status(410).json({
    error:
      'This endpoint has been retired. Sign in at /sign-in (Clerk SSO); the dashboard now sends a Clerk session token on every request.',
  });
});

export default router;

async function loadUserById(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      lockedAt: true,
      role: {
        select: {
          name: true,
          permissions: true,
          rolePermissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  });
}

async function resolveLocalUserFromClerk(clerkUserId) {
  // 1) Already linked.
  let row = await prisma.user.findUnique({
    where: { clerkUserId },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      status: true, lockedAt: true,
      role: {
        select: {
          name: true,
          permissions: true,
          rolePermissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  });
  if (row) return row;

  // 2) Adopt by email — Clerk Backend lookup of the verified primary email.
  let cu;
  try {
    cu = await clerk().users.getUser(clerkUserId);
  } catch (err) {
    console.warn('[auth] clerk.users.getUser failed:', err?.message ?? err);
    return null;
  }
  const email = cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress
    ?? cu?.emailAddresses?.[0]?.emailAddress
    ?? null;
  if (!email) return null;

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { clerkUserId },
    });
    return loadUserById(byEmail.id);
  }

  // 3) JIT provision from the central Identity Command Center. If the
  //    user has access to the "quality" app via any of their org
  //    entitlements (or is an internal MacTech operator), create a local
  //    QMS user row with the mapped role and continue. This removes the
  //    need for a QMS admin to invite every customer-side user manually.
  const iccResult = await checkIdentityAccess({
    clerkUserId,
    appKey: QMS_APP_KEY,
  });
  const access = findActiveAccessForApp(iccResult, QMS_APP_KEY);
  if (!access) return null;

  const qmsRoleName = mapIccRoleToQmsRole(
    access.org.role,
    access.user.isInternalMacTechUser,
  );
  const role = await prisma.role.findFirst({
    where: { name: qmsRoleName },
    select: { id: true },
  });
  if (!role) {
    console.error(
      `[auth] JIT provision failed: QMS role '${qmsRoleName}' not found.`,
    );
    return null;
  }

  // Record the raw ICC role at provision time so the SystemUsers UI can
  // detect manual overrides later (current QMS role !=
  // mapIccRoleToQmsRole(iccRoleAtProvision)). Internal MacTech operators
  // get the sentinel since they don't have a per-org ICC role.
  const iccRoleAtProvision = access.user.isInternalMacTechUser
    ? INTERNAL_MACTECH_SENTINEL
    : access.org.role ?? null;

  const created = await prisma.user.create({
    data: {
      email,
      firstName: access.user.firstName ?? cu?.firstName ?? '',
      lastName: access.user.lastName ?? cu?.lastName ?? '',
      clerkUserId,
      roleId: role.id,
      status: 'ACTIVE',
      iccRoleAtProvision,
    },
    select: { id: true },
  });
  console.log(
    `[auth] JIT-provisioned QMS user ${email} as ${qmsRoleName} ` +
      `(ICC role: ${iccRoleAtProvision}, via org ${access.org.orgName})`,
  );
  return loadUserById(created.id);
}

function flattenPermissions(role) {
  const fromJoin = role?.rolePermissions?.map((rp) => rp.permission?.code).filter(Boolean) ?? [];
  if (fromJoin.length) return fromJoin;
  return role?.permissions ?? [];
}

/**
 * Express middleware: verify a Clerk session token off the Authorization
 * header, resolve (or adopt) the local user row, and attach req.user.
 */
export async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization' });
  }
  const token = auth.slice(7);

  let payload;
  try {
    payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const clerkUserId = payload?.sub;
  if (!clerkUserId) {
    return res.status(401).json({ error: 'Token missing sub claim' });
  }

  const user = await resolveLocalUserFromClerk(clerkUserId);
  if (!user) {
    return res.status(403).json({
      error:
        'Your Clerk account is not linked to a QMS user. Ask an administrator to invite you (the email on the QMS user row must match your Clerk email).',
    });
  }
  if (user.status && user.status !== 'ACTIVE') {
    return res.status(401).json({ error: 'Account is not active' });
  }
  if (user.lockedAt) {
    return res.status(401).json({ error: 'Account is locked' });
  }

  req.clerkPayload = payload;
  req.user = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    roleName: user.role?.name,
    permissions: flattenPermissions(user.role),
  };

  // Forward a deduped session-opened event to the central Identity hub.
  // Fire-and-forget; never blocks the request, never throws upstream.
  if (shouldFireAuditOnce(`quality.session:${clerkUserId}`, AUDIT_SESSION_DEDUP_MS)) {
    sendAuditLogAsync({
      payload: {
        appKey: 'quality',
        eventType: 'quality.session.opened',
        eventCategory: 'auth',
        action: 'Opened MacTech Quality (QMS / document control)',
        actorClerkUserId: clerkUserId,
        actorEmail: user.email,
        metadata: { roleName: user.role?.name, path: req.path },
      },
    });
  }
  return next();
}

/**
 * Training API auth: integration token (training:read, GET-only) OR legacy
 * X-INTEGRATION-KEY OR Clerk-backed user JWT. Sets req.trainingActor.
 */
export async function trainingAuthMiddleware(req, res, next) {
  const intToken = getIntegrationTokenFromRequest(req);
  const legacyKey = process.env.INTEGRATION_KEY || '';

  const allowIntegrationRead = async () => {
    if (req.method !== 'GET') {
      return res.status(403).json({ error: 'Integration token is read-only. Use a Clerk session token for write operations.' });
    }
    req.trainingActor = 'integration';
    let auditUserId = process.env.INTEGRATION_AUDIT_USER_ID;
    if (!auditUserId) {
      const sysUser = await prisma.user.findFirst({
        where: { role: { name: 'System Admin' } },
        select: { id: true },
      });
      auditUserId = sysUser?.id ?? null;
    }
    req.auditUserId = auditUserId;
    return next();
  };

  if (intToken) {
    const decoded = verifyIntegrationToken(intToken);
    if (decoded && decoded.scp.includes('training:read')) {
      req.integration = { clientId: decoded.cid, scopes: decoded.scp };
      return allowIntegrationRead();
    }
    if (decoded) {
      return res.status(403).json({ error: 'Integration token is read-only. Use a Clerk session token for write operations.' });
    }
  }

  if (checkLegacyIntegrationKey(req, legacyKey)) {
    return allowIntegrationRead();
  }

  return authMiddleware(req, res, () => {
    req.trainingActor = 'user';
    req.auditUserId = req.user?.id ?? null;
    next();
  });
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.roleName;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const roleName = req.user?.roleName;
    const permissions = req.user?.permissions || [];
    if (roleName === 'System Admin' || roleName === 'Admin') return next();
    if (!permissions.includes(permission)) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }
    next();
  };
}
