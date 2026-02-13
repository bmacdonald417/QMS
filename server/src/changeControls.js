import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { requirePermission } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';
import { z } from 'zod';

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = req.params.id;
    const dir = path.join(UPLOAD_DIR, 'change-control', id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${randomUUID()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const CC_ENTITY = 'ChangeControl';

export const VALID_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['REVIEW', 'CANCELLED'],
  REVIEW: ['APPROVAL', 'SUBMITTED'],
  APPROVAL: ['IMPLEMENTATION', 'REVIEW'],
  IMPLEMENTATION: ['EFFECTIVENESS', 'APPROVAL'],
  EFFECTIVENESS: ['PENDING_CLOSURE', 'IMPLEMENTATION'],
  PENDING_CLOSURE: ['CLOSED', 'EFFECTIVENESS'],
  CLOSED: [],
  CANCELLED: [],
  ARCHIVED: [],
};

export function isAllowedCCTransition(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

async function createCCHistory(changeControlId, userId, action, details = null) {
  await prisma.changeControlHistory.create({
    data: { changeControlId, userId, action, details: details ?? undefined },
  });
}

async function createNotifications(userIds, message, link) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, message, link })),
  });
}

async function getNextChangeId() {
  const year = new Date().getFullYear();
  const prefix = `CC-${year}-`;
  const existing = await prisma.changeControl.findMany({
    where: { changeId: { startsWith: prefix } },
    select: { changeId: true },
  });
  let max = 0;
  for (const row of existing) {
    const match = row.changeId?.replace(prefix, '').match(/^(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

const listQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'dueDate', 'changeId', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

router.get('/', requirePermission('change:view'), async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    const { status, search, ownerId, page, limit, sort, order } = parsed.data;
    const where = {};
    if (status) where.status = status;
    if (ownerId) where.ownerId = ownerId;
    if (search?.trim()) {
      where.OR = [
        { changeId: { contains: search.trim(), mode: 'insensitive' } },
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.changeControl.findMany({
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
      prisma.changeControl.count({ where }),
    ]);
    res.json({ changeControls: items, total, page, limit });
  } catch (err) {
    console.error('List change controls error:', err);
    res.status(500).json({ error: 'Failed to list change controls' });
  }
});

const createBodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  riskAssessment: z.string().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable().or(z.date()),
});

router.post('/', requirePermission('change:create'), async (req, res) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const data = parsed.data;
    const changeId = await getNextChangeId();
    const cc = await prisma.$transaction(async (tx) => {
      const created = await tx.changeControl.create({
        data: {
          changeId,
          title: data.title,
          description: data.description,
          riskAssessment: data.riskAssessment ?? undefined,
          status: 'DRAFT',
          initiatorId: req.user.id,
          ownerId: data.ownerId ?? undefined,
          siteId: data.siteId ?? undefined,
          departmentId: data.departmentId ?? undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        },
        include: {
          initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await tx.changeControlHistory.create({
        data: { changeControlId: created.id, userId: req.user.id, action: 'CREATED', details: { changeId: created.changeId, title: created.title } },
      });
      return created;
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CHANGE_CONTROL_CREATED',
      entityType: CC_ENTITY,
      entityId: cc.id,
      beforeValue: null,
      afterValue: { changeId: cc.changeId, title: cc.title, status: cc.status },
      reason: null,
      ...auditCtx,
    });
    if (cc.ownerId) {
      await createNotifications([cc.ownerId], `You have been assigned as owner of Change Control ${cc.changeId}: ${cc.title}`, `/change-control/${cc.id}`);
    }
    res.status(201).json({ changeControl: cc });
  } catch (err) {
    console.error('Create change control error:', err);
    res.status(500).json({ error: 'Failed to create change control' });
  }
});

router.get('/:id', requirePermission('change:view'), async (req, res) => {
  try {
    const cc = await prisma.changeControl.findUnique({
      where: { id: req.params.id },
      include: {
        initiator: { select: { id: true, firstName: true, lastName: true, email: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
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
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    const fileLinks = await prisma.fileLink.findMany({
      where: { entityType: 'CHANGE_CONTROL', entityId: cc.id },
      include: { fileAsset: true },
    });
    const links = await prisma.entityLink.findMany({
      where: {
        OR: [
          { sourceType: 'CHANGE_CONTROL', sourceId: cc.id },
          { targetType: 'CHANGE_CONTROL', targetId: cc.id },
        ],
      },
    });
    res.json({ changeControl: { ...cc, attachments: fileLinks, links } });
  } catch (err) {
    console.error('Get change control error:', err);
    res.status(500).json({ error: 'Failed to fetch change control' });
  }
});

const updateBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).optional(),
  riskAssessment: z.string().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable().or(z.date()).nullable(),
  reason: z.string().min(1),
});

router.put('/:id', requirePermission('change:update'), async (req, res) => {
  try {
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const { reason, ...updates } = parsed.data;
    const cc = await prisma.changeControl.findUnique({ where: { id: req.params.id } });
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    if (['CLOSED', 'CANCELLED', 'ARCHIVED'].includes(cc.status)) return res.status(400).json({ error: 'Cannot update in current status' });
    const data = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.riskAssessment !== undefined) data.riskAssessment = updates.riskAssessment ?? null;
    if (updates.ownerId !== undefined) data.ownerId = updates.ownerId ?? null;
    if (updates.siteId !== undefined) data.siteId = updates.siteId ?? null;
    if (updates.departmentId !== undefined) data.departmentId = updates.departmentId ?? null;
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.changeControl.update({
        where: { id: cc.id },
        data,
        include: { initiator: { select: { id: true, firstName: true, lastName: true, email: true } }, owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      await tx.changeControlHistory.create({
        data: { changeControlId: cc.id, userId: req.user.id, action: 'UPDATED', details: { reason, changes: Object.keys(data) } },
      });
      return u;
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CHANGE_CONTROL_UPDATED',
      entityType: CC_ENTITY,
      entityId: cc.id,
      beforeValue: cc,
      afterValue: updated,
      reason,
      ...auditCtx,
    });
    res.json({ changeControl: updated });
  } catch (err) {
    console.error('Update change control error:', err);
    res.status(500).json({ error: 'Failed to update change control' });
  }
});

const transitionBodySchema = z.object({ toStatus: z.string(), reason: z.string().min(1) });

router.post('/:id/transition', requirePermission('change:update'), async (req, res) => {
  try {
    const parsed = transitionBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const { toStatus, reason } = parsed.data;
    const cc = await prisma.changeControl.findUnique({ where: { id: req.params.id }, include: { owner: true } });
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    if (!isAllowedCCTransition(cc.status, toStatus)) {
      return res.status(400).json({ error: `Invalid transition from ${cc.status} to ${toStatus}`, allowed: VALID_TRANSITIONS[cc.status] });
    }
    const updateData = { status: toStatus };
    if (toStatus === 'CLOSED') updateData.closedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.changeControl.update({
        where: { id: cc.id },
        data: updateData,
        include: { initiator: { select: { id: true, firstName: true, lastName: true, email: true } }, owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      await tx.changeControlHistory.create({
        data: { changeControlId: cc.id, userId: req.user.id, action: 'STATUS_CHANGE', details: { from: cc.status, to: toStatus, reason } },
      });
      return u;
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CHANGE_CONTROL_STATUS_CHANGED',
      entityType: CC_ENTITY,
      entityId: cc.id,
      beforeValue: { status: cc.status },
      afterValue: { status: toStatus },
      reason,
      ...auditCtx,
    });
    if (cc.ownerId) await createNotifications([cc.ownerId], `Change Control ${cc.changeId} status changed to ${toStatus}.`, `/change-control/${cc.id}`);
    res.json({ changeControl: updated });
  } catch (err) {
    console.error('Transition change control error:', err);
    res.status(500).json({ error: 'Failed to transition' });
  }
});

const taskCreateSchema = z.object({
  taskType: z.string(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable().or(z.date()),
  stepNumber: z.number().int().min(0).default(0),
});
const createTasksBodySchema = z.object({
  tasks: z.array(taskCreateSchema).min(1).max(50),
  reason: z.string().min(1),
});

const validTaskTypes = ['IMPACT_ASSESSMENT', 'REVIEW', 'APPROVAL', 'IMPLEMENTATION', 'TRAINING', 'EFFECTIVENESS_CHECK', 'CLOSURE_REVIEW'];

router.post('/:id/tasks', requirePermission('change:assign_tasks'), async (req, res) => {
  try {
    const parsed = createTasksBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const { tasks: taskInputs, reason } = parsed.data;
    const cc = await prisma.changeControl.findUnique({ where: { id: req.params.id } });
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const t of taskInputs) {
        if (!validTaskTypes.includes(t.taskType)) continue;
        const task = await tx.changeControlTask.create({
          data: {
            changeControlId: cc.id,
            taskType: t.taskType,
            title: t.title,
            description: t.description ?? undefined,
            assignedToId: t.assignedToId ?? undefined,
            dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
            stepNumber: t.stepNumber ?? 0,
            createdById: req.user.id,
          },
          include: { assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } } },
        });
        out.push(task);
        await tx.changeControlHistory.create({
          data: { changeControlId: cc.id, userId: req.user.id, action: 'TASK_CREATED', details: { taskId: task.id, title: task.title, taskType: task.taskType, reason } },
        });
      }
      return out;
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CHANGE_CONTROL_TASKS_CREATED',
      entityType: CC_ENTITY,
      entityId: cc.id,
      beforeValue: null,
      afterValue: { taskIds: created.map((t) => t.id), count: created.length },
      reason,
      ...auditCtx,
    });
    const notifyIds = [...new Set(created.map((t) => t.assignedToId).filter(Boolean))];
    if (notifyIds.length) await createNotifications(notifyIds, `You have been assigned task(s) on Change Control ${cc.changeId}.`, `/change-control/${cc.id}`);
    res.status(201).json({ tasks: created });
  } catch (err) {
    console.error('Create change control tasks error:', err);
    res.status(500).json({ error: 'Failed to create tasks' });
  }
});

const completeTaskBodySchema = z.object({ completionNotes: z.string().optional().nullable(), reason: z.string().min(1) });

router.post('/:id/tasks/:taskId/complete', requirePermission('change:assign_tasks'), async (req, res) => {
  try {
    const parsed = completeTaskBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const { completionNotes, reason } = parsed.data;
    const task = await prisma.changeControlTask.findFirst({
      where: { id: req.params.taskId, changeControlId: req.params.id },
      include: { changeControl: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status === 'COMPLETED') return res.status(400).json({ error: 'Task already completed' });
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.changeControlTask.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', completedAt: new Date(), completionNotes: completionNotes ?? undefined, completedById: req.user.id },
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      await tx.changeControlHistory.create({
        data: { changeControlId: task.changeControlId, userId: req.user.id, action: 'TASK_COMPLETED', details: { taskId: task.id, completionNotes: completionNotes ?? undefined, reason } },
      });
      return u;
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CHANGE_CONTROL_TASK_COMPLETED',
      entityType: CC_ENTITY,
      entityId: task.changeControlId,
      beforeValue: { taskId: task.id, status: task.status },
      afterValue: { taskId: task.id, status: 'COMPLETED' },
      reason,
      ...auditCtx,
    });
    if (task.changeControl.ownerId) await createNotifications([task.changeControl.ownerId], `Task "${task.title}" on ${task.changeControl.changeId} was completed.`, `/change-control/${task.changeControlId}`);
    res.json({ task: updated });
  } catch (err) {
    console.error('Complete change control task error:', err);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

router.post('/:id/files', requirePermission('file:upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const purpose = (req.body.purpose && String(req.body.purpose).trim()) || 'evidence';
    const cc = await prisma.changeControl.findUnique({ where: { id: req.params.id } });
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    const relativeKey = path.relative(UPLOAD_DIR, req.file.path).split(path.sep).join('/');
    const buf = fs.readFileSync(req.file.path);
    const { createHash } = await import('node:crypto');
    const sha256Hash = createHash('sha256').update(buf).digest('hex');
    const fileAsset = await prisma.fileAsset.create({
      data: {
        storageKey: relativeKey,
        filename: req.file.originalname || req.file.filename,
        contentType: req.file.mimetype || 'application/octet-stream',
        sizeBytes: req.file.size,
        sha256: sha256Hash,
        uploadedById: req.user.id,
      },
    });
    await prisma.fileLink.create({
      data: { fileAssetId: fileAsset.id, entityType: 'CHANGE_CONTROL', entityId: cc.id, purpose },
    });
    await createCCHistory(cc.id, req.user.id, 'FILE_ATTACHED', { fileAssetId: fileAsset.id, filename: fileAsset.filename, purpose });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CHANGE_CONTROL_FILE_ATTACHED',
      entityType: CC_ENTITY,
      entityId: cc.id,
      beforeValue: null,
      afterValue: { fileAssetId: fileAsset.id, filename: fileAsset.filename, purpose },
      reason: null,
      ...auditCtx,
    });
    res.status(201).json({ fileAsset });
  } catch (err) {
    console.error('Upload change control file error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

const linkBodySchema = z.object({
  targetType: z.enum(['DOCUMENT', 'CAPA', 'CHANGE_CONTROL', 'TRAINING_MODULE']),
  targetId: z.string().uuid(),
  linkType: z.string().min(1),
});

router.post('/:id/link', requirePermission('change:update'), async (req, res) => {
  try {
    const parsed = linkBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const { targetType, targetId, linkType } = parsed.data;
    const cc = await prisma.changeControl.findUnique({ where: { id: req.params.id } });
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    const link = await prisma.entityLink.create({
      data: { sourceType: 'CHANGE_CONTROL', sourceId: cc.id, targetType, targetId, linkType: linkType.trim() },
    });
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'CHANGE_CONTROL_LINK_ADDED',
      entityType: CC_ENTITY,
      entityId: cc.id,
      beforeValue: null,
      afterValue: { linkId: link.id, targetType, targetId, linkType },
      reason: null,
      ...auditCtx,
    });
    res.status(201).json({ link });
  } catch (err) {
    console.error('Create change control link error:', err);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

router.get('/:id/links', requirePermission('change:view'), async (req, res) => {
  try {
    const cc = await prisma.changeControl.findUnique({ where: { id: req.params.id } });
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    const links = await prisma.entityLink.findMany({
      where: {
        OR: [
          { sourceType: 'CHANGE_CONTROL', sourceId: cc.id },
          { targetType: 'CHANGE_CONTROL', targetId: cc.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ links });
  } catch (err) {
    console.error('Get change control links error:', err);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// GET /api/change-controls/:id/readiness
router.get('/:id/readiness', requirePermission('change:view'), async (req, res) => {
  try {
    const cc = await prisma.changeControl.findUnique({
      where: { id: req.params.id },
      include: { tasks: true },
    });
    if (!cc) return res.status(404).json({ error: 'Change control not found' });
    const fileLinks = await prisma.fileLink.findMany({
      where: { entityType: 'CHANGE_CONTROL', entityId: cc.id },
      include: { fileAsset: true },
    });
    const attachments = fileLinks.filter((l) => !l.fileAsset.isDeleted);
    const tasksIncomplete = cc.tasks.filter((t) => !['COMPLETED', 'REJECTED'].includes(t.status));
    const tasksOverdue = cc.tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && !['COMPLETED', 'REJECTED'].includes(t.status));
    const unmet = [];
    if (cc.status !== 'CLOSED' && cc.status !== 'CANCELLED' && tasksIncomplete.length) {
      unmet.push({ type: 'TASKS_INCOMPLETE', count: tasksIncomplete.length, taskIds: tasksIncomplete.map((t) => t.id) });
    }
    if (tasksOverdue.length) {
      unmet.push({ type: 'TASKS_OVERDUE', count: tasksOverdue.length, taskIds: tasksOverdue.map((t) => t.id) });
    }
    if (cc.status === 'PENDING_CLOSURE' && attachments.length === 0) {
      unmet.push({ type: 'EVIDENCE_MISSING', message: 'No evidence attachments' });
    }
    res.json({ changeControlId: cc.id, changeId: cc.changeId, status: cc.status, readyForClosure: cc.status === 'PENDING_CLOSURE' && unmet.length === 0, unmet });
  } catch (err) {
    console.error('Change control readiness error:', err);
    res.status(500).json({ error: 'Failed to get readiness' });
  }
});

export default router;
