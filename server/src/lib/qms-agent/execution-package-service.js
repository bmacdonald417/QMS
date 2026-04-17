import { prisma } from '../../db.js';
import { createAuditLog, getAuditContext } from '../../audit.js';
import { ARTIFACT_TYPES, findLatestArtifactLog } from './artifact-resolution.js';
import { generateExecutionChecklist } from './checklist-generator.js';
import { generateExecutionTasks } from './task-generator.js';
import { derivePackageType } from './package-type.js';
import { assertExecutionPackageStatusTransition } from './package-status.js';
import { ensureOrganizationMembership } from './organization-context.js';
import { buildExecutionPackagePayload, extractSourceArtifacts } from './payload-builder.js';
import {
  attachImplementationReadinessToPayload,
  buildReadinessContextFromPackage,
  extractImplementationReadinessFromPayload,
  generateAcceptanceOnlyPayload,
  generateFullImplementationReadinessPayload,
  generateReadinessOnlyPayload,
  generateTestPlanOnlyPayload,
} from './implementation-readiness-service.js';
import { getQmsModule } from './module-registry/index.js';
import { buildExecutionIntelligence, mergeIntelligenceChecklistItems, resolveIntelligenceKeys } from './intelligence-engine.js';
import { getWorkflowTemplate } from './workflow-templates/index.js';

export const APPROVED_AGENT_STATUS = 'APPROVED_FOR_IMPLEMENTATION';

const ENTITY = 'ExecutionPackage';

async function appendAgentRunLog(tx, requestId, message, metadata) {
  await tx.agentRunLog.create({
    data: {
      requestId,
      actorType: 'USER',
      message,
      metadata: metadata ?? undefined,
    },
  });
}

async function appendAgentAudit(tx, requestId, userId, action, beforeValue, afterValue) {
  await tx.agentAuditEvent.create({
    data: {
      requestId,
      userId,
      action,
      beforeValue: beforeValue ?? undefined,
      afterValue: afterValue ?? undefined,
    },
  });
}

/**
 * @param {string} id
 */
export async function getExecutionPackageById(id) {
  return prisma.executionPackage.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { orderIndex: 'asc' } },
      agentRequest: {
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          workflowDefinition: { include: { states: true, transitions: true } },
        },
      },
      createdByMembership: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      assignedToMembership: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      sourcePlanRunLog: true,
      sourceWorkflowRunLog: true,
      sourceSchemaRunLog: true,
      cursorHandoffs: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
}

/**
 * @param {{ organizationId: string; status?: string; packageType?: string; take?: number; skip?: number }} filters
 */
export async function listExecutionPackages(filters) {
  const where = { organizationId: filters.organizationId };
  if (filters.status) where.status = filters.status;
  if (filters.packageType) where.packageType = filters.packageType;
  const take = Math.min(filters.take ?? 50, 200);
  const skip = Math.max(filters.skip ?? 0, 0);
  const [items, total] = await Promise.all([
    prisma.executionPackage.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      skip,
      select: {
        id: true,
        title: true,
        summary: true,
        packageType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        agentRequest: { select: { id: true, title: true, status: true, type: true } },
        inferredModuleKey: true,
        suggestedTemplateKey: true,
        moduleKeyOverride: true,
        templateKeyOverride: true,
        createdByMembership: {
          select: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
        assignedToMembership: {
          select: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    }),
    prisma.executionPackage.count({ where }),
  ]);
  return { items, total };
}

/**
 * @param {{ organizationId: string; agentRequestId: string; actorUserId: string; req: import('express').Request }} params
 */
export async function createExecutionPackageForRequest({ organizationId, agentRequestId, actorUserId, req }) {
  const membership = await ensureOrganizationMembership({ organizationId, userId: actorUserId });

  const request = await prisma.agentRequest.findUnique({
    where: { id: agentRequestId },
    include: {
      workflowDefinition: { include: { states: true, transitions: true } },
      runLogs: { orderBy: { createdAt: 'desc' }, take: 200 },
      executionPackage: true,
    },
  });
  if (!request) {
    const err = new Error('Agent request not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (request.status !== APPROVED_AGENT_STATUS) {
    const err = new Error('Only APPROVED_FOR_IMPLEMENTATION requests can be packaged for execution');
    err.code = 'NOT_APPROVED';
    throw err;
  }
  if (request.executionPackage) {
    const err = new Error('An execution package already exists for this request');
    err.code = 'ALREADY_EXISTS';
    throw err;
  }

  const pkg = await prisma.$transaction(async (tx) => {
    let planLog = findLatestArtifactLog(request.runLogs, ARTIFACT_TYPES.IMPLEMENTATION_PLAN);
    let wfLog = findLatestArtifactLog(request.runLogs, ARTIFACT_TYPES.WORKFLOW_SPEC);
    let schemaLog = findLatestArtifactLog(request.runLogs, ARTIFACT_TYPES.SCHEMA_PLAN);

    if (!wfLog && request.workflowDefinition) {
      const wfSnapshot = {
        definition: {
          id: request.workflowDefinition.id,
          name: request.workflowDefinition.name,
          objective: request.workflowDefinition.objective,
          outputType: request.workflowDefinition.outputType,
          states: request.workflowDefinition.states,
          transitions: request.workflowDefinition.transitions,
          graphNotes: request.workflowDefinition.graphNotes,
        },
      };
      wfLog = await tx.agentRunLog.create({
        data: {
          requestId: request.id,
          actorType: 'SYSTEM',
          message: 'Workflow spec snapshot captured for execution packaging (governed synthesis; not autonomous implementation).',
          metadata: {
            artifactType: ARTIFACT_TYPES.WORKFLOW_SPEC,
            synthesized: true,
            workflowSpec: wfSnapshot,
          },
        },
      });
    }

    if (!planLog) {
      planLog = await tx.agentRunLog.create({
        data: {
          requestId: request.id,
          actorType: 'SYSTEM',
          message: 'Implementation plan synthesized from approved intake for execution packaging (read-only artifact).',
          metadata: {
            artifactType: ARTIFACT_TYPES.IMPLEMENTATION_PLAN,
            synthesized: true,
            implementationPlan: {
              title: request.title,
              description: request.description,
              businessReason: request.businessReason,
              moduleName: request.moduleName,
              routePath: request.routePath,
              suggestUpdateJson: request.suggestUpdateJson ?? undefined,
              buildWorkflowJson: request.buildWorkflowJson ?? undefined,
            },
          },
        },
      });
    }

    const needsSchemaLog =
      request.workflowDefinition?.outputType === 'SCHEMA' || request.workflowDefinition?.outputType === 'FULL_SCAFFOLD';
    if (!schemaLog && needsSchemaLog) {
      schemaLog = await tx.agentRunLog.create({
        data: {
          requestId: request.id,
          actorType: 'SYSTEM',
          message: 'Schema plan placeholder recorded at packaging time (confirm real migration design before execution).',
          metadata: {
            artifactType: ARTIFACT_TYPES.SCHEMA_PLAN,
            synthesized: true,
            schemaPlan: {
              note: 'No SCHEMA_PLAN agent log was found; this placeholder exists to preserve traceability.',
              outputType: request.workflowDefinition?.outputType,
            },
          },
        },
      });
    }

    const flags = {
      hasWorkflow: Boolean(wfLog),
      hasSchema: Boolean(schemaLog),
      hasPlan: Boolean(planLog),
    };
    const packageType = derivePackageType(request, flags);
    const keys = resolveIntelligenceKeys(request, null, null);
    const intelligence = buildExecutionIntelligence({
      request,
      packageType,
      inferredModuleKey: keys.inferredModuleKey,
      effectiveModuleKey: keys.effectiveModuleKey,
      suggestedTemplateKey: keys.suggestedTemplateKey,
      effectiveTemplateKey: keys.effectiveTemplateKey,
      scores: keys.scores,
    });
    const moduleDef = keys.effectiveModuleKey ? getQmsModule(keys.effectiveModuleKey) : null;
    const baseChecklist = generateExecutionChecklist(request, moduleDef);
    const checklist = mergeIntelligenceChecklistItems(baseChecklist, intelligence.validationChecklistAdditions || []);
    const taskDefs = generateExecutionTasks({
      packageType,
      request,
      effectiveModuleKey: keys.effectiveModuleKey,
      effectiveTemplateKey: keys.effectiveTemplateKey,
      intelligence,
    });
    const { implementationPlan, workflowSpec, schemaPlan } = extractSourceArtifacts(planLog, wfLog, schemaLog);
    const readinessCtx = buildReadinessContextFromPackage({
      packageType,
      agentRequest: request,
      intelligenceJson: intelligence,
      tasks: taskDefs,
      payloadJson: { sourceArtifacts: { implementationPlan, workflowSpec, schemaPlan } },
    });
    const implementationReadiness = generateFullImplementationReadinessPayload(readinessCtx, null);
    const payload = buildExecutionPackagePayload({
      request,
      packageType,
      checklist,
      tasks: taskDefs,
      implementationPlan,
      workflowSpec,
      schemaPlan,
      intelligence,
      implementationReadiness,
    });

    const summaryLines = [
      `Request ${request.id} (${request.type}) packaged for engineering execution.`,
      `Module: ${request.moduleName ?? 'n/a'}; route: ${request.routePath ?? 'n/a'}`,
    ];

    const created = await tx.executionPackage.create({
      data: {
        organizationId,
        agentRequestId: request.id,
        title: `Execution — ${request.title}`,
        summary: summaryLines.join('\n'),
        packageType,
        status: 'DRAFT',
        sourcePlanRunLogId: planLog.id,
        sourceWorkflowRunLogId: wfLog?.id ?? null,
        sourceSchemaRunLogId: schemaLog?.id ?? null,
        payloadJson: payload,
        checklistJson: checklist,
        intelligenceJson: intelligence,
        inferredModuleKey: keys.inferredModuleKey,
        moduleKeyOverride: null,
        suggestedTemplateKey: keys.suggestedTemplateKey,
        templateKeyOverride: null,
        createdByMembershipId: membership.id,
      },
    });

    if (taskDefs.length) {
      await tx.executionTask.createMany({
        data: taskDefs.map((t) => ({
          executionPackageId: created.id,
          title: t.title,
          description: t.description,
          taskType: t.taskType,
          status: 'OPEN',
          orderIndex: t.orderIndex,
          metadataJson: t.metadata ?? undefined,
        })),
      });
    }

    await appendAgentAudit(tx, request.id, actorUserId, 'EXECUTION_PACKAGE_CREATED', null, {
      executionPackageId: created.id,
      packageType,
      sourcePlanRunLogId: planLog.id,
      sourceWorkflowRunLogId: wfLog?.id ?? null,
      sourceSchemaRunLogId: schemaLog?.id ?? null,
      inferredModuleKey: keys.inferredModuleKey,
      suggestedTemplateKey: keys.suggestedTemplateKey,
    });
    await appendAgentRunLog(tx, request.id, 'Execution package created (DRAFT)', {
      executionPackageId: created.id,
      packageType,
      governance: 'read_only_export',
    });

    return created;
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'EXECUTION_PACKAGE_CREATED',
    entityType: ENTITY,
    entityId: pkg.id,
    afterValue: { agentRequestId, packageType: pkg.packageType, status: pkg.status },
    reason: `Packaged approved agent request ${agentRequestId}`,
    ...auditCtx,
  });

  return getExecutionPackageById(pkg.id);
}

/**
 * @param {{ packageId: string; organizationId: string; toStatus: string; actorUserId: string; req: import('express').Request }} params
 */
export async function transitionExecutionPackageStatus({ packageId, organizationId, toStatus, actorUserId, req }) {
  const existing = await prisma.executionPackage.findFirst({
    where: { id: packageId, organizationId },
  });
  if (!existing) {
    const err = new Error('Execution package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  assertExecutionPackageStatusTransition(existing.status, toStatus);

  await prisma.$transaction(async (tx) => {
    await tx.executionPackage.update({
      where: { id: packageId },
      data: { status: toStatus },
    });
    await appendAgentAudit(tx, existing.agentRequestId, actorUserId, 'EXECUTION_PACKAGE_STATUS', { status: existing.status }, { status: toStatus });
    await appendAgentRunLog(tx, existing.agentRequestId, `Execution package status set to ${toStatus}`, {
      executionPackageId: packageId,
    });
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'EXECUTION_PACKAGE_STATUS_CHANGED',
    entityType: ENTITY,
    entityId: packageId,
    beforeValue: { status: existing.status },
    afterValue: { status: toStatus },
    ...auditCtx,
  });

  return getExecutionPackageById(packageId);
}

/**
 * @param {{ packageId: string; organizationId: string; assignedToUserId: string | null; actorUserId: string; req: import('express').Request }} params
 */
export async function assignExecutionPackageOwner({ packageId, organizationId, assignedToUserId, actorUserId, req }) {
  const existing = await prisma.executionPackage.findFirst({
    where: { id: packageId, organizationId },
  });
  if (!existing) {
    const err = new Error('Execution package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  let assignedToMembershipId = null;
  if (assignedToUserId) {
    const m = await ensureOrganizationMembership({ organizationId, userId: assignedToUserId });
    assignedToMembershipId = m.id;
  }

  await prisma.executionPackage.update({
    where: { id: packageId },
    data: { assignedToMembershipId },
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'EXECUTION_PACKAGE_ASSIGNED',
    entityType: ENTITY,
    entityId: packageId,
    afterValue: { assignedToMembershipId, assignedToUserId },
    ...auditCtx,
  });

  await prisma.agentRunLog.create({
    data: {
      requestId: existing.agentRequestId,
      actorType: 'USER',
      message: 'Execution package assignee updated',
      metadata: { executionPackageId: packageId, assignedToUserId },
    },
  });

  return getExecutionPackageById(packageId);
}

/**
 * @param {{ taskId: string; packageId: string; organizationId: string; patch: { title?: string; description?: string; status?: string; orderIndex?: number }; actorUserId: string; req: import('express').Request }} params
 */
export async function patchExecutionTask({ taskId, packageId, organizationId, patch, actorUserId, req }) {
  const pkg = await prisma.executionPackage.findFirst({
    where: { id: packageId, organizationId },
    select: { id: true, agentRequestId: true },
  });
  if (!pkg) {
    const err = new Error('Execution package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const task = await prisma.executionTask.findFirst({
    where: { id: taskId, executionPackageId: packageId },
  });
  if (!task) {
    const err = new Error('Task not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const data = {};
  if (typeof patch.title === 'string') data.title = patch.title;
  if (typeof patch.description === 'string') data.description = patch.description;
  if (typeof patch.status === 'string') data.status = patch.status;
  if (typeof patch.orderIndex === 'number' && Number.isFinite(patch.orderIndex)) data.orderIndex = patch.orderIndex;

  await prisma.executionTask.update({ where: { id: taskId }, data });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'EXECUTION_TASK_UPDATED',
    entityType: 'ExecutionTask',
    entityId: taskId,
    afterValue: data,
    ...auditCtx,
  });

  await prisma.agentRunLog.create({
    data: {
      requestId: pkg.agentRequestId,
      actorType: 'USER',
      message: 'Execution task updated',
      metadata: { executionPackageId: packageId, taskId, patch: data },
    },
  });

  return prisma.executionTask.findUnique({ where: { id: taskId } });
}

/**
 * @param {{ packageId: string; organizationId: string; moduleKeyOverride: string | null; templateKeyOverride: string | null; actorUserId: string; req: import('express').Request }} params
 */
export async function setExecutionPackageIntelligenceOverrides({
  packageId,
  organizationId,
  moduleKeyOverride,
  templateKeyOverride,
  actorUserId,
  req,
}) {
  const existing = await prisma.executionPackage.findFirst({
    where: { id: packageId, organizationId },
    select: { id: true, agentRequestId: true },
  });
  if (!existing) {
    const err = new Error('Execution package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (moduleKeyOverride) {
    const mod = getQmsModule(moduleKeyOverride);
    if (!mod) {
      const err = new Error('Unknown moduleKey override');
      err.code = 'INVALID_MODULE';
      throw err;
    }
  }
  if (templateKeyOverride) {
    const tpl = getWorkflowTemplate(templateKeyOverride);
    if (!tpl) {
      const err = new Error('Unknown templateKey override');
      err.code = 'INVALID_TEMPLATE';
      throw err;
    }
  }

  await prisma.executionPackage.update({
    where: { id: packageId },
    data: {
      moduleKeyOverride: moduleKeyOverride ?? null,
      templateKeyOverride: templateKeyOverride ?? null,
    },
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'EXECUTION_PACKAGE_INTELLIGENCE_OVERRIDES_SET',
    entityType: ENTITY,
    entityId: packageId,
    afterValue: { moduleKeyOverride, templateKeyOverride },
    ...auditCtx,
  });

  await prisma.agentRunLog.create({
    data: {
      requestId: existing.agentRequestId,
      actorType: 'USER',
      message: 'Execution package intelligence overrides updated',
      metadata: { executionPackageId: packageId, moduleKeyOverride, templateKeyOverride },
    },
  });

  return getExecutionPackageById(packageId);
}

/**
 * @param {{ packageId: string; organizationId: string; actorUserId: string; req: import('express').Request; regenerateTasks?: boolean }} params
 */
export async function regenerateExecutionPackageIntelligence({
  packageId,
  organizationId,
  actorUserId,
  req,
  regenerateTasks = false,
}) {
  const pkg = await prisma.executionPackage.findFirst({
    where: { id: packageId, organizationId },
    include: {
      agentRequest: { include: { workflowDefinition: { include: { states: true, transitions: true } } } },
      tasks: { orderBy: { orderIndex: 'asc' } },
      sourcePlanRunLog: true,
      sourceWorkflowRunLog: true,
      sourceSchemaRunLog: true,
    },
  });
  if (!pkg) {
    const err = new Error('Execution package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const request = pkg.agentRequest;
  const keys = resolveIntelligenceKeys(request, pkg.moduleKeyOverride, pkg.templateKeyOverride);
  const intelligence = buildExecutionIntelligence({
    request,
    packageType: pkg.packageType,
    inferredModuleKey: keys.inferredModuleKey,
    effectiveModuleKey: keys.effectiveModuleKey,
    suggestedTemplateKey: keys.suggestedTemplateKey,
    effectiveTemplateKey: keys.effectiveTemplateKey,
    scores: keys.scores,
  });
  const moduleDef = keys.effectiveModuleKey ? getQmsModule(keys.effectiveModuleKey) : null;
  const checklist = mergeIntelligenceChecklistItems(
    generateExecutionChecklist(request, moduleDef),
    intelligence.validationChecklistAdditions || []
  );
  const taskDefs = generateExecutionTasks({
    packageType: pkg.packageType,
    request,
    effectiveModuleKey: keys.effectiveModuleKey,
    effectiveTemplateKey: keys.effectiveTemplateKey,
    intelligence,
  });

  const { implementationPlan, workflowSpec, schemaPlan } = extractSourceArtifacts(
    pkg.sourcePlanRunLog,
    pkg.sourceWorkflowRunLog,
    pkg.sourceSchemaRunLog
  );

  const existingReadiness = extractImplementationReadinessFromPayload(
    pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {}
  );

  let tasksForPayload = taskDefs;
  if (!regenerateTasks) {
    tasksForPayload = (pkg.tasks || []).map((t) => ({
      title: t.title,
      description: t.description,
      taskType: t.taskType,
      orderIndex: t.orderIndex,
      metadata: t.metadataJson && typeof t.metadataJson === 'object' ? t.metadataJson : undefined,
    }));
  }

  const payload = buildExecutionPackagePayload({
    request,
    packageType: pkg.packageType,
    checklist,
    tasks: tasksForPayload,
    implementationPlan,
    workflowSpec,
    schemaPlan,
    intelligence,
    implementationReadiness: existingReadiness ?? undefined,
  });

  await prisma.$transaction(async (tx) => {
    if (regenerateTasks) {
      await tx.executionTask.deleteMany({ where: { executionPackageId: packageId } });
      if (taskDefs.length) {
        await tx.executionTask.createMany({
          data: taskDefs.map((t) => ({
            executionPackageId: packageId,
            title: t.title,
            description: t.description,
            taskType: t.taskType,
            status: 'OPEN',
            orderIndex: t.orderIndex,
            metadataJson: t.metadata ?? undefined,
          })),
        });
      }
    }

    await tx.executionPackage.update({
      where: { id: packageId },
      data: {
        payloadJson: payload,
        checklistJson: checklist,
        intelligenceJson: intelligence,
        inferredModuleKey: keys.inferredModuleKey,
        suggestedTemplateKey: keys.suggestedTemplateKey,
      },
    });

    await appendAgentAudit(tx, request.id, actorUserId, 'EXECUTION_PACKAGE_INTELLIGENCE_REGENERATED', null, {
      executionPackageId: packageId,
      regenerateTasks,
      inferredModuleKey: keys.inferredModuleKey,
      suggestedTemplateKey: keys.suggestedTemplateKey,
    });
    await appendAgentRunLog(tx, request.id, 'Execution package intelligence regenerated', {
      executionPackageId: packageId,
      regenerateTasks,
    });
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'EXECUTION_PACKAGE_INTELLIGENCE_REGENERATED',
    entityType: ENTITY,
    entityId: packageId,
    afterValue: { regenerateTasks, inferredModuleKey: keys.inferredModuleKey, suggestedTemplateKey: keys.suggestedTemplateKey },
    ...auditCtx,
  });

  return getExecutionPackageById(packageId);
}

/**
 * @param {{ packageId: string; organizationId: string }} params
 */
async function loadPackageForOrgMutation({ packageId, organizationId }) {
  const pkg = await prisma.executionPackage.findFirst({
    where: { id: packageId, organizationId },
    include: {
      tasks: { orderBy: { orderIndex: 'asc' } },
      agentRequest: { include: { workflowDefinition: { include: { states: true, transitions: true } } } },
      sourcePlanRunLog: true,
      sourceWorkflowRunLog: true,
      sourceSchemaRunLog: true,
    },
  });
  if (!pkg) {
    const err = new Error('Execution package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return pkg;
}

/**
 * @param {{ packageId: string; organizationId: string; actorUserId: string; req: import('express').Request; mutator: (args: { ctx: ReturnType<typeof buildReadinessContextFromPackage>; prior: Record<string, unknown> | null; basePayload: Record<string, unknown> }) => Record<string, unknown>; auditAction: string; runMessage: string }} params
 */
async function mutateImplementationReadiness({
  packageId,
  organizationId,
  actorUserId,
  req,
  mutator,
  auditAction,
  runMessage,
}) {
  const pkg = await loadPackageForOrgMutation({ packageId, organizationId });
  const basePayload =
    pkg.payloadJson && typeof pkg.payloadJson === 'object' ? { .../** @type {any} */ (pkg.payloadJson) } : {};
  const prior = extractImplementationReadinessFromPayload(basePayload);
  const ctx = buildReadinessContextFromPackage(pkg);
  const implementationReadiness = mutator({ ctx, prior, basePayload });
  const nextPayload = attachImplementationReadinessToPayload(basePayload, implementationReadiness);

  await prisma.$transaction(async (tx) => {
    await tx.executionPackage.update({
      where: { id: packageId },
      data: { payloadJson: nextPayload },
    });
    await appendAgentAudit(tx, pkg.agentRequestId, actorUserId, auditAction, prior ?? null, {
      executionPackageId: packageId,
      readinessBand: /** @type {any} */ (implementationReadiness)?.readinessScore?.band,
    });
    await appendAgentRunLog(tx, pkg.agentRequestId, runMessage, {
      executionPackageId: packageId,
      governance: 'read_only_export',
    });
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: auditAction,
    entityType: ENTITY,
    entityId: packageId,
    afterValue: { readinessBand: /** @type {any} */ (implementationReadiness)?.readinessScore?.band },
    ...auditCtx,
  });

  return getExecutionPackageById(packageId);
}

/**
 * @param {{ packageId: string; organizationId: string; actorUserId: string; req: import('express').Request }} params
 */
export async function generateExecutionPackageAcceptance({ packageId, organizationId, actorUserId, req }) {
  return mutateImplementationReadiness({
    packageId,
    organizationId,
    actorUserId,
    req,
    auditAction: 'EXECUTION_PACKAGE_ACCEPTANCE_GENERATED',
    runMessage: 'Execution package acceptance criteria regenerated',
    mutator: ({ ctx, prior }) => generateAcceptanceOnlyPayload(ctx, prior),
  });
}

/**
 * @param {{ packageId: string; organizationId: string; actorUserId: string; req: import('express').Request }} params
 */
export async function generateExecutionPackageTestPlan({ packageId, organizationId, actorUserId, req }) {
  return mutateImplementationReadiness({
    packageId,
    organizationId,
    actorUserId,
    req,
    auditAction: 'EXECUTION_PACKAGE_TEST_PLAN_GENERATED',
    runMessage: 'Execution package regression / test plan regenerated',
    mutator: ({ ctx, prior }) => generateTestPlanOnlyPayload(ctx, prior),
  });
}

/**
 * @param {{ packageId: string; organizationId: string; actorUserId: string; req: import('express').Request }} params
 */
export async function generateExecutionPackageReadinessScore({ packageId, organizationId, actorUserId, req }) {
  return mutateImplementationReadiness({
    packageId,
    organizationId,
    actorUserId,
    req,
    auditAction: 'EXECUTION_PACKAGE_READINESS_SCORED',
    runMessage: 'Execution package readiness scoring regenerated',
    mutator: ({ ctx, prior }) => generateReadinessOnlyPayload(ctx, prior),
  });
}

/**
 * @param {{ packageId: string; organizationId: string; actorUserId: string; req: import('express').Request }} params
 */
export async function generateExecutionPackageImplementationReadiness({ packageId, organizationId, actorUserId, req }) {
  return mutateImplementationReadiness({
    packageId,
    organizationId,
    actorUserId,
    req,
    auditAction: 'EXECUTION_PACKAGE_IMPLEMENTATION_READINESS_GENERATED',
    runMessage: 'Execution package implementation readiness bundle regenerated',
    mutator: ({ ctx, prior }) => generateFullImplementationReadinessPayload(ctx, prior),
  });
}

/**
 * @param {{ packageId: string; organizationId: string }} params
 */
export async function getExecutionPackageReadiness({ packageId, organizationId }) {
  const pkg = await prisma.executionPackage.findFirst({
    where: { id: packageId, organizationId },
    select: { id: true, payloadJson: true },
  });
  if (!pkg) {
    const err = new Error('Execution package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const implementationReadiness = extractImplementationReadinessFromPayload(
    pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {}
  );
  return { packageId: pkg.id, implementationReadiness };
}

/**
 * @param {{ packageId: string; organizationId: string; actorUserId: string; note?: string | null; req: import('express').Request }} params
 */
export async function acknowledgeExecutionPackageReadinessGaps({ packageId, organizationId, actorUserId, note, req }) {
  const pkg = await loadPackageForOrgMutation({ packageId, organizationId });
  const basePayload =
    pkg.payloadJson && typeof pkg.payloadJson === 'object' ? { .../** @type {any} */ (pkg.payloadJson) } : {};
  const prior = extractImplementationReadinessFromPayload(basePayload) || {};
  const ctx = buildReadinessContextFromPackage(pkg);
  const gapsAcknowledged = {
    at: new Date().toISOString(),
    userId: actorUserId,
    note: note ?? null,
  };
  let implementationReadiness = { ...prior, gapsAcknowledged };
  if (!Array.isArray(/** @type {any} */ (prior).acceptanceCriteria) || !/** @type {any} */ (prior).acceptanceCriteria.length) {
    implementationReadiness = {
      ...generateFullImplementationReadinessPayload(ctx, { ...prior, gapsAcknowledged }),
      gapsAcknowledged,
    };
  }
  const nextPayload = attachImplementationReadinessToPayload(basePayload, implementationReadiness);

  await prisma.$transaction(async (tx) => {
    await tx.executionPackage.update({
      where: { id: packageId },
      data: { payloadJson: nextPayload },
    });
    await appendAgentAudit(tx, pkg.agentRequestId, actorUserId, 'EXECUTION_PACKAGE_READINESS_GAPS_ACKNOWLEDGED', null, {
      executionPackageId: packageId,
    });
    await appendAgentRunLog(tx, pkg.agentRequestId, 'Execution package readiness gaps acknowledged by admin', {
      executionPackageId: packageId,
    });
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'EXECUTION_PACKAGE_READINESS_GAPS_ACKNOWLEDGED',
    entityType: ENTITY,
    entityId: packageId,
    afterValue: { note: note ?? null },
    ...auditCtx,
  });

  return getExecutionPackageById(packageId);
}
