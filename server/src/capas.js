import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { requirePermission } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';
import { z } from 'zod';

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const capaId = req.params.id;
    const dir = path.join(UPLOAD_DIR, 'capa', capaId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${randomUUID()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const CAPA_ENTITY = 'CAPA';

export const VALID_TRANSITIONS = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['CONTAINMENT', 'CANCELLED'],
  CONTAINMENT: ['INVESTIGATION', 'OPEN'],
  INVESTIGATION: ['RCA_COMPLETE', 'CONTAINMENT'],
  RCA_COMPLETE: ['PLAN_APPROVAL', 'INVESTIGATION'],
  PLAN_APPROVAL: ['IMPLEMENTATION', 'RCA_COMPLETE'],
  IMPLEMENTATION: ['EFFECTIVENESS_CHECK', 'PLAN_APPROVAL'],
  EFFECTIVENESS_CHECK: ['PENDING_CLOSURE', 'IMPLEMENTATION'],
  PENDING_CLOSURE: ['CLOSED', 'EFFECTIVENESS_CHECK'],
  CLOSED: [],
  CANCELLED: [],
  ARCHIVED: [],
};

export function isAllowedTransition(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

function sha256(input) {
  return createHash('sha256').update(input).toString('hex');
}

function hasPermission(req, code) {
  if (req.user?.roleName === 'Admin' || req.user?.roleName === 'System Admin') return true;
  return (req.user?.permissions || []).includes(code);
}

async function createCapaHistory(capaId, userId, action, details = null, digitalSignatureId = null) {
  await prisma.capaHistory.create({
    data: { capaId, userId, action, details: details ?? undefined, digitalSignatureId },
  });
}

async function createNotifications(userIds, message, link) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, message, link })),
  });
}

async function getNextCapaId() {
  const year = new Date().getFullYear();
  const prefix = `CAPA-${year}-`;
  const existing = await prisma.cAPA.findMany({
    where: { capaId: { startsWith: prefix } },
    select: { capaId: true },
  });
  let max = 0;
  for (const row of existing) {
    const match = row.capaId?.replace(prefix, '').match(/^(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ---------- List CAPAs (GET /api/capas) ----------
const listQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'dueDate', 'capaId', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

router.get('/', requirePermission('capa:view'), async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const { status, search, ownerId, siteId, departmentId, dateFrom, dateTo, page, limit, sort, order } = parsed.data;

    const where = {};
    if (status) where.status = status;
    if (ownerId) where.ownerId = ownerId;
    if (siteId) where.siteId = siteId;
    if (departmentId) where.departmentId = departmentId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (search && search.trim()) {
      where.OR = [
        { capaId: { contains: search.trim(), mode: 'insensitive' } },
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.cAPA.findMany({
        where,
        include: {
          initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
          site: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cAPA.count({ where }),
    ]);

    res.json({ capas: items, total, page, limit });
  } catch (err) {
    console.error('List CAPAs error:', err);
    res.status(500).json({ error: 'Failed to list CAPAs' });
  }
});

// ---------- Create CAPA (POST /api/capas) ----------
const createBodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  status: z.enum(['DRAFT', 'OPEN']).default('DRAFT'),
  ownerId: z.string().uuid().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  severity: z.string().max(50).optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable().or(z.date()),
});

router.post('/', requirePermission('capa:create'), async (req, res) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const capaId = await getNextCapaId();

    const capa = await prisma.$transaction(async (tx) => {
      const created = await tx.cAPA.create({
        data: {
          capaId,
          title: data.title,
          description: data.description,
          status: data.status,
          initiatorId: req.user.id,
          ownerId: data.ownerId ?? undefined,
          assigneeId: data.assigneeId ?? undefined,
          severity: data.severity ?? undefined,
          siteId: data.siteId ?? undefined,
          departmentId: data.departmentId ?? undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        },
        include: {
          initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await tx.capaHistory.create({
        data: {
          capaId: created.id,
          userId: req.user.id,
          action: 'CREATED',
          details: { capaId: created.capaId, title: created.title, status: created.status },
        },
      });
      return created;
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_CREATED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: null,
      afterValue: { capaId: capa.capaId, title: capa.title, status: capa.status },
      reason: null,
      ...auditCtx,
    });

    if (capa.ownerId) {
      await createNotifications(
        [capa.ownerId],
        `You have been assigned as owner of CAPA ${capa.capaId}: ${capa.title}`,
        `/capas/${capa.id}`
      );
    }

    res.status(201).json({ capa });
  } catch (err) {
    console.error('Create CAPA error:', err);
    res.status(500).json({ error: 'Failed to create CAPA' });
  }
});

// ---------- Get one CAPA (GET /api/capas/:id) ----------
router.get('/:id', requirePermission('capa:view'), async (req, res) => {
  try {
    const capa = await prisma.cAPA.findUnique({
      where: { id: req.params.id },
      include: {
        initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        site: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        tasks: {
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
            completedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }],
        },
        history: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { timestamp: 'desc' },
        },
        signatures: {
          include: { signer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { signedAt: 'desc' },
        },
      },
    });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });

    const fileLinks = await prisma.fileLink.findMany({
      where: { entityType: 'CAPA', entityId: capa.id },
      include: {
        fileAsset: true,
      },
    });
    const links = await prisma.entityLink.findMany({
      where: {
        OR: [
          { sourceType: 'CAPA', sourceId: capa.id },
          { targetType: 'CAPA', targetId: capa.id },
        ],
      },
    });

    res.json({ capa: { ...capa, attachments: fileLinks, links } });
  } catch (err) {
    console.error('Get CAPA error:', err);
    res.status(500).json({ error: 'Failed to fetch CAPA' });
  }
});

// ---------- Upload file (POST /api/capas/:id/files) ----------
router.post('/:id/files', requirePermission('file:upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const purpose = (req.body.purpose && String(req.body.purpose).trim()) || 'evidence';
    const capa = await prisma.cAPA.findUnique({ where: { id: req.params.id } });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });

    const relativeKey = path.relative(UPLOAD_DIR, req.file.path).split(path.sep).join('/');
    const buf = fs.readFileSync(req.file.path);
    const sha256Hash = sha256(buf);

    const [fileAsset, fileLink] = await prisma.$transaction(async (tx) => {
      const asset = await tx.fileAsset.create({
        data: {
          storageKey: relativeKey,
          filename: req.file.originalname || req.file.filename,
          contentType: req.file.mimetype || 'application/octet-stream',
          sizeBytes: req.file.size,
          sha256: sha256Hash,
          uploadedById: req.user.id,
        },
      });
      await tx.fileLink.create({
        data: {
          fileAssetId: asset.id,
          entityType: 'CAPA',
          entityId: capa.id,
          purpose,
        },
      });
      return [asset, { fileAssetId: asset.id, entityType: 'CAPA', entityId: capa.id, purpose }];
    });

    await createCapaHistory(capa.id, req.user.id, 'FILE_ATTACHED', {
      fileAssetId: fileAsset.id,
      filename: fileAsset.filename,
      purpose,
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_FILE_ATTACHED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: null,
      afterValue: { fileAssetId: fileAsset.id, filename: fileAsset.filename, purpose },
      reason: null,
      ...auditCtx,
    });

    res.status(201).json({ fileAsset, fileLink });
  } catch (err) {
    console.error('Upload CAPA file error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ---------- Update CAPA (PUT /api/capas/:id) ----------
const updateBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).optional(),
  ownerId: z.string().uuid().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  severity: z.string().max(50).optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  rootCause: z.string().optional().nullable(),
  containmentSummary: z.string().optional().nullable(),
  correctiveSummary: z.string().optional().nullable(),
  preventiveSummary: z.string().optional().nullable(),
  effectivenessPlan: z.string().optional().nullable(),
  effectivenessResult: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable().or(z.date()).nullable(),
  reason: z.string().min(1),
});

router.put('/:id', requirePermission('capa:update'), async (req, res) => {
  try {
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { reason, ...updates } = parsed.data;
    const capa = await prisma.cAPA.findUnique({ where: { id: req.params.id } });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    if (['CLOSED', 'CANCELLED', 'ARCHIVED'].includes(capa.status)) {
      return res.status(400).json({ error: 'Cannot update CAPA in current status' });
    }

    const before = { ...capa };
    const data = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.ownerId !== undefined) data.ownerId = updates.ownerId ?? null;
    if (updates.assigneeId !== undefined) data.assigneeId = updates.assigneeId ?? null;
    if (updates.severity !== undefined) data.severity = updates.severity ?? null;
    if (updates.siteId !== undefined) data.siteId = updates.siteId ?? null;
    if (updates.departmentId !== undefined) data.departmentId = updates.departmentId ?? null;
    if (updates.rootCause !== undefined) data.rootCause = updates.rootCause ?? null;
    if (updates.containmentSummary !== undefined) data.containmentSummary = updates.containmentSummary ?? null;
    if (updates.correctiveSummary !== undefined) data.correctiveSummary = updates.correctiveSummary ?? null;
    if (updates.preventiveSummary !== undefined) data.preventiveSummary = updates.preventiveSummary ?? null;
    if (updates.effectivenessPlan !== undefined) data.effectivenessPlan = updates.effectivenessPlan ?? null;
    if (updates.effectivenessResult !== undefined) data.effectivenessResult = updates.effectivenessResult ?? null;
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.cAPA.update({
        where: { id: capa.id },
        data,
        include: {
          initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await tx.capaHistory.create({
        data: {
          capaId: capa.id,
          userId: req.user.id,
          action: 'UPDATED',
          details: { reason, changes: Object.keys(data) },
        },
      });
      return u;
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_UPDATED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: before,
      afterValue: updated,
      reason,
      ...auditCtx,
    });

    res.json({ capa: updated });
  } catch (err) {
    console.error('Update CAPA error:', err);
    res.status(500).json({ error: 'Failed to update CAPA' });
  }
});

// ---------- Status transition (POST /api/capas/:id/transition) ----------
const transitionBodySchema = z.object({
  toStatus: z.string(),
  reason: z.string().min(1),
});

router.post('/:id/transition', requirePermission('capa:update'), async (req, res) => {
  try {
    const parsed = transitionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { toStatus, reason } = parsed.data;
    const capa = await prisma.cAPA.findUnique({ where: { id: req.params.id }, include: { owner: true } });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    if (!isAllowedTransition(capa.status, toStatus)) {
      return res.status(400).json({
        error: `Invalid transition from ${capa.status} to ${toStatus}`,
        allowed: VALID_TRANSITIONS[capa.status],
      });
    }

    const before = { status: capa.status };
    const updateData = { status: toStatus };
    if (toStatus === 'CLOSED') updateData.closedAt = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.cAPA.update({
        where: { id: capa.id },
        data: updateData,
        include: {
          initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await tx.capaHistory.create({
        data: {
          capaId: capa.id,
          userId: req.user.id,
          action: 'STATUS_CHANGE',
          details: { from: capa.status, to: toStatus, reason },
        },
      });
      return u;
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_STATUS_CHANGED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: before,
      afterValue: { status: toStatus },
      reason,
      ...auditCtx,
    });

    if (capa.ownerId && ['OPEN', 'CONTAINMENT', 'INVESTIGATION', 'PLAN_APPROVAL', 'IMPLEMENTATION', 'EFFECTIVENESS_CHECK'].includes(toStatus)) {
      await createNotifications(
        [capa.ownerId],
        `CAPA ${capa.capaId} status changed to ${toStatus}.`,
        `/capas/${capa.id}`
      );
    }

    res.json({ capa: updated });
  } catch (err) {
    console.error('Transition CAPA error:', err);
    res.status(500).json({ error: 'Failed to transition CAPA' });
  }
});

// ---------- Create task(s) (POST /api/capas/:id/tasks) ----------
const taskCreateSchema = z.object({
  taskType: z.string(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable().or(z.date()),
  requiresEsign: z.boolean().default(false),
  stepNumber: z.number().int().min(0).default(0),
});
const createTasksBodySchema = z.object({
  tasks: z.array(taskCreateSchema).min(1).max(50),
  reason: z.string().min(1),
});

router.post('/:id/tasks', requirePermission('capa:assign_tasks'), async (req, res) => {
  try {
    const parsed = createTasksBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { tasks: taskInputs, reason } = parsed.data;
    const capa = await prisma.cAPA.findUnique({ where: { id: req.params.id } });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });

    const validTaskTypes = ['CONTAINMENT_ACTION', 'INVESTIGATION_STEP', 'ROOT_CAUSE_ANALYSIS', 'CORRECTIVE_ACTION', 'PREVENTIVE_ACTION', 'EFFECTIVENESS_CHECK', 'APPROVAL', 'CLOSURE_REVIEW'];
    const created = await prisma.$transaction(async (tx) => {
      const createdTasks = [];
      for (const t of taskInputs) {
        if (!validTaskTypes.includes(t.taskType)) continue;
        const task = await tx.capaTask.create({
          data: {
            capaId: capa.id,
            taskType: t.taskType,
            title: t.title,
            description: t.description ?? undefined,
            assignedToId: t.assignedToId ?? undefined,
            dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
            requiresEsign: t.requiresEsign ?? false,
            stepNumber: t.stepNumber ?? 0,
            createdById: req.user.id,
          },
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });
        createdTasks.push(task);
        await tx.capaHistory.create({
          data: {
            capaId: capa.id,
            userId: req.user.id,
            action: 'TASK_CREATED',
            details: { taskId: task.id, title: task.title, taskType: task.taskType, reason },
          },
        });
      }
      return createdTasks;
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_TASKS_CREATED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: null,
      afterValue: { taskIds: created.map((t) => t.id), count: created.length },
      reason,
      ...auditCtx,
    });

    const notifyIds = [...new Set(created.map((t) => t.assignedToId).filter(Boolean))];
    if (notifyIds.length) {
      await createNotifications(
        notifyIds,
        `You have been assigned task(s) on CAPA ${capa.capaId}: ${capa.title}`,
        `/capas/${capa.id}`
      );
    }

    res.status(201).json({ tasks: created });
  } catch (err) {
    console.error('Create CAPA tasks error:', err);
    res.status(500).json({ error: 'Failed to create tasks' });
  }
});

// ---------- Update task (PUT /api/capas/:id/tasks/:taskId) ----------
const updateTaskBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable().or(z.date()).nullable(),
  status: z.string().optional(),
  reason: z.string().min(1),
});

router.put('/:id/tasks/:taskId', requirePermission('capa:assign_tasks'), async (req, res) => {
  try {
    const parsed = updateTaskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { reason, ...updates } = parsed.data;
    const task = await prisma.capaTask.findFirst({
      where: { id: req.params.taskId, capaId: req.params.id },
      include: { capa: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const data = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.assignedToId !== undefined) data.assignedToId = updates.assignedToId ?? null;
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    if (updates.status !== undefined) data.status = updates.status;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.capaTask.update({
        where: { id: task.id },
        data,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await tx.capaHistory.create({
        data: {
          capaId: task.capaId,
          userId: req.user.id,
          action: 'TASK_UPDATED',
          details: { taskId: task.id, reason, changes: Object.keys(data) },
        },
      });
      return u;
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_TASK_UPDATED',
      entityType: CAPA_ENTITY,
      entityId: task.capaId,
      beforeValue: { taskId: task.id, ...task },
      afterValue: updated,
      reason,
      ...auditCtx,
    });

    res.json({ task: updated });
  } catch (err) {
    console.error('Update CAPA task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ---------- Complete task (POST /api/capas/:id/tasks/:taskId/complete) ----------
const completeTaskBodySchema = z.object({
  completionNotes: z.string().optional().nullable(),
  reason: z.string().min(1),
  password: z.string().optional(),
  signaturePayload: z.record(z.unknown()).optional(),
});

router.post('/:id/tasks/:taskId/complete', requirePermission('capa:assign_tasks'), async (req, res) => {
  try {
    const parsed = completeTaskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { completionNotes, reason, password, signaturePayload } = parsed.data;
    const task = await prisma.capaTask.findFirst({
      where: { id: req.params.taskId, capaId: req.params.id },
      include: { capa: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Task is already completed' });
    }

    if (task.requiresEsign) {
      if (!hasPermission(req, 'capa:esign')) {
        return res.status(403).json({ error: 'E-signature required for this task' });
      }
      if (!password) return res.status(400).json({ error: 'Password required for e-signature' });
      const signer = await prisma.user.findUnique({ where: { id: req.user.id }, select: { password: true } });
      const passwordOk = signer && (await bcrypt.compare(password, signer.password));
      if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.capaTask.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completionNotes: completionNotes ?? undefined,
          completedById: req.user.id,
        },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await tx.capaHistory.create({
        data: {
          capaId: task.capaId,
          userId: req.user.id,
          action: 'TASK_COMPLETED',
          details: { taskId: task.id, completionNotes: completionNotes ?? undefined, reason },
        },
      });
      return u;
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_TASK_COMPLETED',
      entityType: CAPA_ENTITY,
      entityId: task.capaId,
      beforeValue: { taskId: task.id, status: task.status },
      afterValue: { taskId: task.id, status: 'COMPLETED' },
      reason,
      ...auditCtx,
    });

    if (task.capa.ownerId) {
      await createNotifications(
        [task.capa.ownerId],
        `Task "${task.title}" on CAPA ${task.capa.capaId} was completed.`,
        `/capas/${task.capaId}`
      );
    }

    res.json({ task: updated });
  } catch (err) {
    console.error('Complete CAPA task error:', err);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// ---------- Approve plan (POST /api/capas/:id/approve-plan) ----------
const approvePlanBodySchema = z.object({
  reason: z.string().min(1),
  password: z.string().optional(),
  signaturePayload: z.record(z.unknown()).optional(),
});

router.post('/:id/approve-plan', requirePermission('capa:approve_plan'), async (req, res) => {
  try {
    const parsed = approvePlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { reason, password } = parsed.data;
    const capa = await prisma.cAPA.findUnique({ where: { id: req.params.id } });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    if (capa.status !== 'PLAN_APPROVAL') {
      return res.status(400).json({ error: 'CAPA must be in PLAN_APPROVAL status to approve plan' });
    }

    const esignConfig = await prisma.eSignConfig.findFirst();
    const requireSign = esignConfig?.requireForCapaPlanApproval ?? true;
    if (requireSign) {
      if (!hasPermission(req, 'capa:esign')) {
        return res.status(403).json({ error: 'E-signature required for plan approval' });
      }
      if (!password) return res.status(400).json({ error: 'Password required for plan approval signature' });
      const signer = await prisma.user.findUnique({ where: { id: req.user.id }, select: { password: true } });
      const passwordOk = signer && (await bcrypt.compare(password, signer.password));
      if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });
    }

    const now = new Date();
    const recordHash = sha256(JSON.stringify({ capaId: capa.id, status: capa.status, action: 'PLAN_APPROVAL', at: now.toISOString() }));
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const signaturePayload = { capaId: capa.id, signerId: req.user.id, signatureMeaning: 'PLAN_APPROVAL', signedAt: now.toISOString(), recordHash };
    const signatureHash = sha256(JSON.stringify(signaturePayload));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cAPA.update({
        where: { id: capa.id },
        data: { status: 'IMPLEMENTATION' },
      });
      if (requireSign) {
        await tx.capaSignature.create({
          data: {
            capaId: capa.id,
            signerId: req.user.id,
            signatureMeaning: 'PLAN_APPROVAL',
            signedAt: now,
            recordHash,
            signatureHash,
            passwordHash: passwordHash ?? undefined,
          },
        });
      }
      await tx.capaHistory.create({
        data: {
          capaId: capa.id,
          userId: req.user.id,
          action: 'PLAN_APPROVED',
          details: { reason, signatureRequired: requireSign },
        },
      });
      return tx.cAPA.findUnique({
        where: { id: capa.id },
        include: {
          initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_PLAN_APPROVED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: { status: capa.status },
      afterValue: { status: 'IMPLEMENTATION' },
      reason,
      ...auditCtx,
    });

    if (capa.ownerId) {
      await createNotifications(
        [capa.ownerId],
        `CAPA ${capa.capaId} plan was approved. Status: IMPLEMENTATION.`,
        `/capas/${capa.id}`
      );
    }

    res.json({ capa: updated });
  } catch (err) {
    console.error('Approve CAPA plan error:', err);
    res.status(500).json({ error: 'Failed to approve plan' });
  }
});

// ---------- Close CAPA (POST /api/capas/:id/close) ----------
const closeBodySchema = z.object({
  reason: z.string().min(1),
  password: z.string().optional(),
  effectivenessWaived: z.boolean().optional(),
  effectivenessJustification: z.string().optional(),
});

router.post('/:id/close', requirePermission('capa:close'), async (req, res) => {
  try {
    const parsed = closeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { reason, password, effectivenessWaived, effectivenessJustification } = parsed.data;
    const capa = await prisma.cAPA.findUnique({
      where: { id: req.params.id },
      include: { tasks: true },
    });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    if (capa.status !== 'PENDING_CLOSURE' && capa.status !== 'CLOSED') {
      return res.status(400).json({ error: 'CAPA must be in PENDING_CLOSURE to close' });
    }

    const correctiveDone = capa.tasks.some((t) => t.taskType === 'CORRECTIVE_ACTION' && t.status === 'COMPLETED');
    const effectivenessDone = capa.tasks.some((t) => t.taskType === 'EFFECTIVENESS_CHECK' && t.status === 'COMPLETED');
    if (!correctiveDone) {
      return res.status(400).json({ error: 'At least one corrective action must be completed before closure' });
    }
    if (!effectivenessDone && !effectivenessWaived) {
      return res.status(400).json({ error: 'Effectiveness check must be completed or waived with justification' });
    }
    if (effectivenessWaived && !(effectivenessJustification?.trim())) {
      return res.status(400).json({ error: 'Effectiveness waiver requires justification' });
    }

    const esignConfig = await prisma.eSignConfig.findFirst();
    const requireSign = esignConfig?.requireForCapaClosure ?? true;
    if (requireSign) {
      if (!hasPermission(req, 'capa:esign')) {
        return res.status(403).json({ error: 'E-signature required for CAPA closure' });
      }
      if (!password) return res.status(400).json({ error: 'Password required for closure signature' });
      const signer = await prisma.user.findUnique({ where: { id: req.user.id }, select: { password: true } });
      const passwordOk = signer && (await bcrypt.compare(password, signer.password));
      if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });
    }

    const now = new Date();
    const recordHash = sha256(JSON.stringify({ capaId: capa.id, status: capa.status, action: 'CLOSURE', at: now.toISOString() }));
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const signaturePayload = { capaId: capa.id, signerId: req.user.id, signatureMeaning: 'CLOSURE', signedAt: now.toISOString(), recordHash };
    const signatureHash = sha256(JSON.stringify(signaturePayload));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cAPA.update({
        where: { id: capa.id },
        data: { status: 'CLOSED', closedAt: now },
      });
      if (requireSign) {
        await tx.capaSignature.create({
          data: {
            capaId: capa.id,
            signerId: req.user.id,
            signatureMeaning: 'CLOSURE',
            signedAt: now,
            recordHash,
            signatureHash,
            passwordHash: passwordHash ?? undefined,
          },
        });
      }
      await tx.capaHistory.create({
        data: {
          capaId: capa.id,
          userId: req.user.id,
          action: 'CLOSED',
          details: { reason, effectivenessWaived: effectivenessWaived ?? false, effectivenessJustification: effectivenessJustification ?? null },
        },
      });
      return tx.cAPA.findUnique({
        where: { id: capa.id },
        include: {
          initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_CLOSED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: { status: capa.status },
      afterValue: { status: 'CLOSED', closedAt: now },
      reason,
      ...auditCtx,
    });

    res.json({ capa: updated });
  } catch (err) {
    console.error('Close CAPA error:', err);
    res.status(500).json({ error: 'Failed to close CAPA' });
  }
});

// ---------- Entity links: POST /api/capas/:id/link, GET /api/capas/:id/links ----------
const linkBodySchema = z.object({
  targetType: z.enum(['DOCUMENT', 'CAPA', 'CHANGE_CONTROL', 'TRAINING_MODULE']),
  targetId: z.string().uuid(),
  linkType: z.string().min(1),
});

router.post('/:id/link', requirePermission('capa:update'), async (req, res) => {
  try {
    const parsed = linkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { targetType, targetId, linkType } = parsed.data;
    const capa = await prisma.cAPA.findUnique({ where: { id: req.params.id } });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });

    const link = await prisma.entityLink.create({
      data: {
        sourceType: 'CAPA',
        sourceId: capa.id,
        targetType,
        targetId,
        linkType: linkType.trim(),
      },
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CAPA_LINK_ADDED',
      entityType: CAPA_ENTITY,
      entityId: capa.id,
      beforeValue: null,
      afterValue: { linkId: link.id, targetType, targetId, linkType },
      reason: null,
      ...auditCtx,
    });

    res.status(201).json({ link });
  } catch (err) {
    console.error('Create CAPA link error:', err);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

router.get('/:id/links', requirePermission('capa:view'), async (req, res) => {
  try {
    const capa = await prisma.cAPA.findUnique({ where: { id: req.params.id } });
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });

    const links = await prisma.entityLink.findMany({
      where: {
        OR: [
          { sourceType: 'CAPA', sourceId: capa.id },
          { targetType: 'CAPA', targetId: capa.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ links });
  } catch (err) {
    console.error('Get CAPA links error:', err);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

export default router;
