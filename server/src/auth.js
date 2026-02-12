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
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = { userId: user.id, roleName: user.role.name };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roleName: user.role.name,
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
export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization' });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.jwtPayload = decoded;
    // Load user with role for req.user
    prisma.user
      .findUnique({
        where: { id: decoded.userId },
        include: { role: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: { select: { name: true } },
        },
      })
      .then((user) => {
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          roleName: user.role.name,
        };
        next();
      })
      .catch((err) => {
        console.error('Auth middleware:', err);
        res.status(500).json({ error: 'Authentication failed' });
      });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
