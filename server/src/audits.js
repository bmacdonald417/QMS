import express from 'express';
import { prisma } from './db.js';
import { requirePermission } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';
import { z } from 'zod';

const router = express.Router();
const ENTITY_AUDIT = 'Audit';
const ENTITY_AUDIT_FINDING = 'AuditFinding';

const createAuditBodySchema = z.object({
  name: z.string().min(1).max(500),
  auditKind: z.enum(['INTERNAL', 'EXTERNAL', 'SUPPLIER']),
  scheduledDate: z.string().datetime().or(z.coerce.date()),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});

const patchAuditBodySchema = z.object({
  name: z.string().min(1).max(500).optional(),
  auditKind: z.enum(['INTERNAL', 'EXTERNAL', 'SUPPLIER']).optional(),
  scheduledDate: z.string().datetime().or(z.coerce.date()).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  reason: z.string().min(1),
});

const createFindingBodySchema = z.object({
  findingCode: z.string().min(1).max(80),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  linkedCapaId: z.string().uuid().optional().nullable(),
  responseDue: z.string().datetime().optional().nullable().or(z.coerce.date()).nullable(),
  reason: z.string().min(1),
});

const patchFindingBodySchema = z.object({
  findingCode: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  linkedCapaId: z.string().uuid().optional().nullable(),
  responseDue: z.string().datetime().optional().nullable().or(z.coerce.date()).nullable(),
  reason: z.string().min(1),
});

router.get('/', requirePermission('audit:view'), async (req, res) => {
  try {
    const audits = await prisma.audit.findMany({
      include: {
        _count: { select: { findings: true } },
        findings: { select: { linkedCapaId: true } },
      },
      orderBy: { scheduledDate: 'desc' },
    });
    const out = audits.map((a) => {
      const linked = a.findings.find((f) => f.linkedCapaId);
      return {
        id: a.id,
        name: a.name,
        auditKind: a.auditKind,
        scheduledDate: a.scheduledDate,
        status: a.status,
        findingsCount: a._count.findings,
        linkedCapaId: linked?.linkedCapaId ?? null,
      };
    });
    res.json({ audits: out });
  } catch (err) {
    console.error('List audits error:', err);
    res.status(500).json({ error: 'Failed to list audits' });
  }
});

router.post('/', requirePermission('audit:manage'), async (req, res) => {
  try {
    const parsed = createAuditBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { name, auditKind, scheduledDate, status } = parsed.data;
    const audit = await prisma.audit.create({
      data: {
        name,
        auditKind,
        scheduledDate: new Date(scheduledDate),
        status: status ?? 'SCHEDULED',
      },
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'AUDIT_CREATED',
      entityType: ENTITY_AUDIT,
      entityId: audit.id,
      beforeValue: null,
      afterValue: { name: audit.name, auditKind: audit.auditKind, status: audit.status },
      reason: null,
      ...auditCtx,
    });
    res.status(201).json({ audit });
  } catch (err) {
    console.error('Create audit error:', err);
    res.status(500).json({ error: 'Failed to create audit' });
  }
});

router.get('/:id', requirePermission('audit:view'), async (req, res) => {
  try {
    const audit = await prisma.audit.findUnique({
      where: { id: req.params.id },
      include: {
        findings: {
          include: {
            capa: { select: { id: true, capaId: true, title: true, status: true } },
          },
          orderBy: [{ findingCode: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    res.json({ audit });
  } catch (err) {
    console.error('Get audit error:', err);
    res.status(500).json({ error: 'Failed to fetch audit' });
  }
});

router.patch('/:id', requirePermission('audit:manage'), async (req, res) => {
  try {
    const parsed = patchAuditBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { reason, ...updates } = parsed.data;
    const existing = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Audit not found' });

    const data = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.auditKind !== undefined) data.auditKind = updates.auditKind;
    if (updates.scheduledDate !== undefined) data.scheduledDate = new Date(updates.scheduledDate);
    if (updates.status !== undefined) data.status = updates.status;

    const audit = await prisma.audit.update({
      where: { id: existing.id },
      data,
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'AUDIT_UPDATED',
      entityType: ENTITY_AUDIT,
      entityId: audit.id,
      beforeValue: existing,
      afterValue: audit,
      reason,
      ...auditCtx,
    });
    res.json({ audit });
  } catch (err) {
    console.error('Patch audit error:', err);
    res.status(500).json({ error: 'Failed to update audit' });
  }
});

router.post('/:id/findings', requirePermission('audit:manage'), async (req, res) => {
  try {
    const parsed = createFindingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { reason, ...body } = parsed.data;
    const audit = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    if (body.linkedCapaId) {
      const capa = await prisma.cAPA.findUnique({ where: { id: body.linkedCapaId } });
      if (!capa) return res.status(400).json({ error: 'Linked CAPA not found' });
    }

    const finding = await prisma.auditFinding.create({
      data: {
        auditId: audit.id,
        findingCode: body.findingCode,
        title: body.title,
        description: body.description ?? undefined,
        severity: body.severity ?? 'MINOR',
        status: body.status ?? 'OPEN',
        linkedCapaId: body.linkedCapaId ?? undefined,
        responseDue: body.responseDue ? new Date(body.responseDue) : undefined,
      },
      include: {
        capa: { select: { id: true, capaId: true, title: true, status: true } },
      },
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'AUDIT_FINDING_CREATED',
      entityType: ENTITY_AUDIT_FINDING,
      entityId: finding.id,
      beforeValue: null,
      afterValue: { auditId: audit.id, findingCode: finding.findingCode, title: finding.title },
      reason,
      ...auditCtx,
    });

    res.status(201).json({ finding });
  } catch (err) {
    console.error('Create finding error:', err);
    res.status(500).json({ error: 'Failed to create finding' });
  }
});

router.patch('/:id/findings/:findingId', requirePermission('audit:manage'), async (req, res) => {
  try {
    const parsed = patchFindingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { reason, ...updates } = parsed.data;
    const finding = await prisma.auditFinding.findFirst({
      where: { id: req.params.findingId, auditId: req.params.id },
    });
    if (!finding) return res.status(404).json({ error: 'Finding not found' });

    if (updates.linkedCapaId) {
      const capa = await prisma.cAPA.findUnique({ where: { id: updates.linkedCapaId } });
      if (!capa) return res.status(400).json({ error: 'Linked CAPA not found' });
    }

    const data = {};
    if (updates.findingCode !== undefined) data.findingCode = updates.findingCode;
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description ?? null;
    if (updates.severity !== undefined) data.severity = updates.severity;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.linkedCapaId !== undefined) data.linkedCapaId = updates.linkedCapaId ?? null;
    if (updates.responseDue !== undefined) data.responseDue = updates.responseDue ? new Date(updates.responseDue) : null;

    const updated = await prisma.auditFinding.update({
      where: { id: finding.id },
      data,
      include: {
        capa: { select: { id: true, capaId: true, title: true, status: true } },
      },
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'AUDIT_FINDING_UPDATED',
      entityType: ENTITY_AUDIT_FINDING,
      entityId: updated.id,
      beforeValue: finding,
      afterValue: updated,
      reason,
      ...auditCtx,
    });

    res.json({ finding: updated });
  } catch (err) {
    console.error('Patch finding error:', err);
    res.status(500).json({ error: 'Failed to update finding' });
  }
});

export default router;
