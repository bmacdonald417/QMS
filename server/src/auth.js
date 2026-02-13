import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'qms-dev-secret-change-in-production';

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user: { id, firstName, lastName, email, roleName } }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status && user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account is not active' });
    }
    if (user.lockedAt) {
      return res.status(401).json({ error: 'Account is locked. Contact an administrator.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    const payload = { userId: user.id, roleName: user.role.name, tokenVersion: user.tokenVersion ?? 0 };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    const permissions = (user.role.rolePermissions?.map((rp) => rp.permission?.code).filter(Boolean)) ?? user.role.permissions ?? [];
    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roleName: user.role.name,
        permissions,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;

/**
 * Middleware: verify JWT and attach user (without password) to req.user
 */
export async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization' });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        lockedAt: true,
        tokenVersion: true,
        role: {
          select: {
            name: true,
            permissions: true,
            rolePermissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.status && user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account is not active' });
    }
    if (user.lockedAt) {
      return res.status(401).json({ error: 'Account is locked' });
    }
    const expectedVersion = user.tokenVersion ?? 0;
    if ((decoded.tokenVersion ?? 0) !== expectedVersion) {
      return res.status(401).json({ error: 'Session revoked. Please sign in again.' });
    }
    const fromJoin = user.role.rolePermissions?.map((rp) => rp.permission?.code).filter(Boolean) ?? [];
    const permissions = fromJoin.length ? fromJoin : (user.role.permissions || []);
    req.jwtPayload = decoded;
    req.user = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      roleName: user.role.name,
      permissions,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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
    if (roleName === 'System Admin') return next();
    if (!permissions.includes(permission)) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }
    next();
  };
}
