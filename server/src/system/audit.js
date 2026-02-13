import express from 'express';
import { prisma } from '../db.js';
import { requireSystemRole, requireSystemPermission } from '../systemMiddleware.js';

const router = express.Router();

// GET /api/system/audit - list with filters, pagination
router.get(
  '/',
  requireSystemRole('System Admin', 'Quality Manager', 'Manager'),
  requireSystemPermission('auditlog:view'),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const skip = (page - 1) * limit;
      const userId = req.query.userId || null;
      const action = req.query.action || null;
      const entityType = req.query.entityType || null;
      const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

      const where = {};
      if (userId) where.userId = userId;
      if (action) where.action = action;
      if (entityType) where.entityType = entityType;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      console.error('System audit list error:', err);
      res.status(500).json({ error: 'Failed to list audit logs' });
    }
  }
);

// GET /api/system/audit/export?format=csv&...
router.get(
  '/export',
  requireSystemRole('System Admin', 'Quality Manager', 'Manager'),
  requireSystemPermission('auditlog:view'),
  async (req, res) => {
    try {
      const format = (req.query.format || 'csv').toLowerCase();
      const userId = req.query.userId || null;
      const action = req.query.action || null;
      const entityType = req.query.entityType || null;
      const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
      const maxRows = Math.min(10000, parseInt(req.query.limit, 10) || 5000);

      const where = {};
      if (userId) where.userId = userId;
      if (action) where.action = action;
      if (entityType) where.entityType = entityType;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const logs = await prisma.auditLog.findMany({
        where,
        take: maxRows,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      });

      if (format === 'csv') {
        const header = 'Created,User,Action,Entity Type,Entity ID,Reason,IP,Request ID\n';
        const rows = logs.map((l) => {
          const user = l.user ? `${l.user.firstName} ${l.user.lastName} (${l.user.email})` : l.userId;
          const reason = (l.reason || '').replace(/"/g, '""');
          return `${l.createdAt.toISOString()},"${user}",${l.action},${l.entityType},${l.entityId || ''},"${reason}",${l.ip || ''},${l.requestId || ''}`;
        });
        const csv = header + rows.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
        res.send(csv);
        return;
      }

      res.json({ logs });
    } catch (err) {
      console.error('System audit export error:', err);
      res.status(500).json({ error: 'Failed to export audit log' });
    }
  }
);

// GET /api/system/audit/:id - single log detail
router.get(
  '/:id',
  requireSystemRole('System Admin', 'Quality Manager', 'Manager'),
  requireSystemPermission('auditlog:view'),
  async (req, res) => {
    try {
      const log = await prisma.auditLog.findUnique({
        where: { id: req.params.id },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      if (!log) return res.status(404).json({ error: 'Audit log not found' });
      res.json({ log });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }
);

export default router;
