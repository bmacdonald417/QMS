import express from 'express';
import { prisma } from './db.js';

const router = express.Router();

// GET /api/users (for assignment pickers)
router.get('/', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: {
          select: {
            name: true,
            permissions: true,
            rolePermissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    res.json({
      users: users.map((u) => {
        const fromJoin = u.role.rolePermissions?.map((rp) => rp.permission?.code).filter(Boolean) ?? [];
        const permissions = fromJoin.length ? fromJoin : (u.role.permissions || []);
        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          roleName: u.role.name,
          permissions,
        };
      }),
    });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

export default router;
