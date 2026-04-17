import express from 'express';
import { z } from 'zod';
import { requireRoles } from './auth.js';
import { prisma } from './db.js';
import { createAuditLog, getAuditContext } from './audit.js';
import {
  createExecutionPackageForRequest,
  getExecutionPackageById,
  listExecutionPackages,
  transitionExecutionPackageStatus,
  assignExecutionPackageOwner,
  patchExecutionTask,
  setExecutionPackageIntelligenceOverrides,
  regenerateExecutionPackageIntelligence,
  generateExecutionPackageAcceptance,
  generateExecutionPackageTestPlan,
  generateExecutionPackageReadinessScore,
  generateExecutionPackageImplementationReadiness,
  getExecutionPackageReadiness,
  acknowledgeExecutionPackageReadinessGaps,
} from './lib/qms-agent/execution-package-service.js';
import { createCursorHandoffForPackage, getLatestCursorHandoff } from './lib/qms-agent/cursor-handoff-service.js';
import { listQmsModules, getQmsModule } from './lib/qms-agent/module-registry/index.js';
import { listWorkflowTemplates, getWorkflowTemplate } from './lib/qms-agent/workflow-templates/index.js';
import { analyzeAgentRequest } from './lib/qms-agent/module-analysis-service.js';

const router = express.Router();

const adminOnly = requireRoles('System Admin');

const scoped = express.Router({ mergeParams: true });

scoped.use(async (req, res, next) => {
  try {
    const slug = req.params.slug;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Organization slug is required' });
    }
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    req.organizationId = org.id;
    req.organization = org;
    return next();
  } catch (err) {
    console.error('Org QMS Agent resolve error:', err);
    return res.status(500).json({ error: 'Failed to resolve organization' });
  }
});

const postExecutionPackageSchema = z.object({}).strict();

const patchStatusSchema = z.object({
  status: z.enum(['DRAFT', 'READY', 'SENT_TO_DEV', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
});

const patchTaskSchema = z
  .object({
    title: z.string().min(1).max(512).optional(),
    description: z.string().min(1).max(20000).optional(),
    status: z.enum(['OPEN', 'BLOCKED', 'IN_PROGRESS', 'DONE']).optional(),
    orderIndex: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

const postHandoffSchema = z
  .object({
    advanceToSentToDev: z.boolean().optional(),
  })
  .strict();

const patchAssigneeSchema = z
  .object({
    assignedToUserId: z.string().uuid().nullable(),
  })
  .strict();

const patchIntelligenceOverridesSchema = z
  .object({
    moduleKeyOverride: z.string().min(1).max(128).nullable(),
    templateKeyOverride: z.string().min(1).max(128).nullable(),
  })
  .strict();

const postRegenerateIntelligenceSchema = z
  .object({
    regenerateTasks: z.boolean().optional(),
  })
  .strict();

const postAcknowledgeReadinessGapsSchema = z
  .object({
    note: z.string().max(4000).optional(),
  })
  .strict();

/** GET /api/org/:slug/qms-agent/modules */
scoped.get('/modules', (_req, res) => {
  try {
    const modules = listQmsModules().map((m) => ({
      moduleKey: m.moduleKey,
      displayName: m.displayName,
      description: m.description,
    }));
    return res.json({ modules });
  } catch (err) {
    console.error('List modules error:', err);
    return res.status(500).json({ error: 'Failed to list modules' });
  }
});

/** GET /api/org/:slug/qms-agent/modules/:moduleKey */
scoped.get('/modules/:moduleKey', (req, res) => {
  try {
    const mod = getQmsModule(req.params.moduleKey);
    if (!mod) return res.status(404).json({ error: 'Module not found' });
    return res.json({ module: mod });
  } catch (err) {
    console.error('Get module error:', err);
    return res.status(500).json({ error: 'Failed to load module' });
  }
});

/** GET /api/org/:slug/qms-agent/workflow-templates */
scoped.get('/workflow-templates', (_req, res) => {
  try {
    const templates = listWorkflowTemplates().map((t) => ({
      templateKey: t.templateKey,
      templateName: t.templateName,
      targetModules: t.targetModules,
    }));
    return res.json({ templates });
  } catch (err) {
    console.error('List workflow templates error:', err);
    return res.status(500).json({ error: 'Failed to list workflow templates' });
  }
});

/** GET /api/org/:slug/qms-agent/workflow-templates/:templateKey */
scoped.get('/workflow-templates/:templateKey', (req, res) => {
  try {
    const tpl = getWorkflowTemplate(req.params.templateKey);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    return res.json({ template: tpl });
  } catch (err) {
    console.error('Get workflow template error:', err);
    return res.status(500).json({ error: 'Failed to load workflow template' });
  }
});

/** POST /api/org/:slug/qms-agent/requests/:id/module-analysis */
scoped.post('/requests/:id/module-analysis', async (req, res) => {
  try {
    const analysis = await analyzeAgentRequest(req.params.id);
    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'AGENT_REQUEST_MODULE_ANALYSIS',
      entityType: 'AgentRequest',
      entityId: req.params.id,
      afterValue: { inferredModuleKey: analysis.inferredModuleKey, suggestedTemplateKey: analysis.suggestedTemplateKey },
      ...auditCtx,
    });
    return res.json({ analysis });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Module analysis error:', err);
    return res.status(500).json({ error: 'Failed to analyze request' });
  }
});

/** PATCH /api/org/:slug/qms-agent/execution-packages/:packageId/intelligence-overrides */
scoped.patch('/execution-packages/:packageId/intelligence-overrides', express.json(), async (req, res) => {
  try {
    const parsed = patchIntelligenceOverridesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const pkg = await setExecutionPackageIntelligenceOverrides({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      moduleKeyOverride: parsed.data.moduleKeyOverride,
      templateKeyOverride: parsed.data.templateKeyOverride,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err?.code === 'INVALID_MODULE' || err?.code === 'INVALID_TEMPLATE') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    console.error('Intelligence overrides error:', err);
    return res.status(500).json({ error: 'Failed to update overrides' });
  }
});

/** POST /api/org/:slug/qms-agent/execution-packages/:packageId/regenerate-intelligence */
scoped.post('/execution-packages/:packageId/regenerate-intelligence', express.json(), async (req, res) => {
  try {
    const parsed = postRegenerateIntelligenceSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const pkg = await regenerateExecutionPackageIntelligence({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      actorUserId: req.user.id,
      req,
      regenerateTasks: parsed.data.regenerateTasks ?? false,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Regenerate intelligence error:', err);
    return res.status(500).json({ error: 'Failed to regenerate intelligence' });
  }
});

/** POST /api/org/:slug/qms-agent/requests/:id/execution-package */
scoped.post('/requests/:id/execution-package', express.json(), async (req, res) => {
  try {
    const parsed = postExecutionPackageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const pkg = await createExecutionPackageForRequest({
      organizationId: req.organizationId,
      agentRequestId: req.params.id,
      actorUserId: req.user.id,
      req,
    });
    return res.status(201).json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err?.code === 'NOT_APPROVED' || err?.code === 'ALREADY_EXISTS') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    console.error('Create execution package error:', err);
    return res.status(500).json({ error: 'Failed to create execution package' });
  }
});

/** GET /api/org/:slug/qms-agent/execution-packages */
scoped.get('/execution-packages', async (req, res) => {
  try {
    const { status, packageType, limit, offset } = req.query;
    const take = Math.min(parseInt(String(limit || '50'), 10) || 50, 200);
    const skip = Math.max(parseInt(String(offset || '0'), 10) || 0, 0);
    const result = await listExecutionPackages({
      organizationId: req.organizationId,
      status: typeof status === 'string' && status ? status : undefined,
      packageType: typeof packageType === 'string' && packageType ? packageType : undefined,
      take,
      skip,
    });
    return res.json(result);
  } catch (err) {
    console.error('List execution packages error:', err);
    return res.status(500).json({ error: 'Failed to list execution packages' });
  }
});

/** POST /api/org/:slug/qms-agent/execution-packages/:packageId/generate-acceptance */
scoped.post('/execution-packages/:packageId/generate-acceptance', express.json(), async (req, res) => {
  try {
    const pkg = await generateExecutionPackageAcceptance({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Generate acceptance error:', err);
    return res.status(500).json({ error: 'Failed to generate acceptance criteria' });
  }
});

/** POST /api/org/:slug/qms-agent/execution-packages/:packageId/generate-test-plan */
scoped.post('/execution-packages/:packageId/generate-test-plan', express.json(), async (req, res) => {
  try {
    const pkg = await generateExecutionPackageTestPlan({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Generate test plan error:', err);
    return res.status(500).json({ error: 'Failed to generate test plan' });
  }
});

/** POST /api/org/:slug/qms-agent/execution-packages/:packageId/generate-readiness */
scoped.post('/execution-packages/:packageId/generate-readiness', express.json(), async (req, res) => {
  try {
    const pkg = await generateExecutionPackageReadinessScore({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Generate readiness error:', err);
    return res.status(500).json({ error: 'Failed to generate readiness score' });
  }
});

/** GET /api/org/:slug/qms-agent/execution-packages/:packageId/readiness */
scoped.get('/execution-packages/:packageId/readiness', async (req, res) => {
  try {
    const readiness = await getExecutionPackageReadiness({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
    });
    return res.json(readiness);
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Get readiness error:', err);
    return res.status(500).json({ error: 'Failed to load readiness' });
  }
});

/** POST /api/org/:slug/qms-agent/execution-packages/:packageId/generate-implementation-readiness */
scoped.post('/execution-packages/:packageId/generate-implementation-readiness', express.json(), async (req, res) => {
  try {
    const pkg = await generateExecutionPackageImplementationReadiness({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Generate implementation readiness error:', err);
    return res.status(500).json({ error: 'Failed to generate implementation readiness bundle' });
  }
});

/** POST /api/org/:slug/qms-agent/execution-packages/:packageId/acknowledge-readiness-gaps */
scoped.post('/execution-packages/:packageId/acknowledge-readiness-gaps', express.json(), async (req, res) => {
  try {
    const parsed = postAcknowledgeReadinessGapsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const pkg = await acknowledgeExecutionPackageReadinessGaps({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      actorUserId: req.user.id,
      note: parsed.data.note ?? null,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Acknowledge readiness gaps error:', err);
    return res.status(500).json({ error: 'Failed to acknowledge readiness gaps' });
  }
});

/** GET /api/org/:slug/qms-agent/execution-packages/:packageId */
scoped.get('/execution-packages/:packageId', async (req, res) => {
  try {
    const pkg = await getExecutionPackageById(req.params.packageId);
    if (!pkg || pkg.organizationId !== req.organizationId) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ package: pkg });
  } catch (err) {
    console.error('Get execution package error:', err);
    return res.status(500).json({ error: 'Failed to load execution package' });
  }
});

/** PATCH /api/org/:slug/qms-agent/execution-packages/:packageId/status */
scoped.patch('/execution-packages/:packageId/status', express.json(), async (req, res) => {
  try {
    const parsed = patchStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const pkg = await transitionExecutionPackageStatus({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      toStatus: parsed.data.status,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err?.code === 'INVALID_STATUS_TRANSITION') return res.status(400).json({ error: err.message });
    console.error('Patch execution package status error:', err);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

/** PATCH /api/org/:slug/qms-agent/execution-packages/:packageId/assignee */
scoped.patch('/execution-packages/:packageId/assignee', express.json(), async (req, res) => {
  try {
    const parsed = patchAssigneeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const pkg = await assignExecutionPackageOwner({
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      assignedToUserId: parsed.data.assignedToUserId,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Assign execution package error:', err);
    return res.status(500).json({ error: 'Failed to assign owner' });
  }
});

/** PATCH /api/org/:slug/qms-agent/execution-packages/:packageId/tasks/:taskId */
scoped.patch('/execution-packages/:packageId/tasks/:taskId', express.json(), async (req, res) => {
  try {
    const parsed = patchTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const task = await patchExecutionTask({
      taskId: req.params.taskId,
      packageId: req.params.packageId,
      organizationId: req.organizationId,
      patch: parsed.data,
      actorUserId: req.user.id,
      req,
    });
    return res.json({ task });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('Patch execution task error:', err);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

/** POST /api/org/:slug/qms-agent/execution-packages/:packageId/handoff */
scoped.post('/execution-packages/:packageId/handoff', express.json(), async (req, res) => {
  try {
    const parsed = postHandoffSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const pkg = await getExecutionPackageById(req.params.packageId);
    if (!pkg || pkg.organizationId !== req.organizationId) {
      return res.status(404).json({ error: 'Not found' });
    }
    const handoff = await createCursorHandoffForPackage({
      pkg,
      actorUserId: req.user.id,
      req,
      advanceToSentToDev: parsed.data.advanceToSentToDev ?? true,
    });
    const refreshed = await getExecutionPackageById(req.params.packageId);
    return res.status(201).json({ handoff, package: refreshed });
  } catch (err) {
    if (err?.code === 'PACKAGE_NOT_READY') return res.status(400).json({ error: err.message, code: err.code });
    console.error('Create Cursor handoff error:', err);
    return res.status(500).json({ error: 'Failed to create Cursor handoff' });
  }
});

/** GET /api/org/:slug/qms-agent/execution-packages/:packageId/handoff */
scoped.get('/execution-packages/:packageId/handoff', async (req, res) => {
  try {
    const pkg = await prisma.executionPackage.findFirst({
      where: { id: req.params.packageId, organizationId: req.organizationId },
      select: { id: true },
    });
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    const handoff = await getLatestCursorHandoff(req.params.packageId);
    if (!handoff) return res.status(404).json({ error: 'No handoff found' });
    return res.json({ handoff });
  } catch (err) {
    console.error('Get Cursor handoff error:', err);
    return res.status(500).json({ error: 'Failed to load Cursor handoff' });
  }
});

router.use('/:slug/qms-agent', adminOnly, scoped);

export default router;
