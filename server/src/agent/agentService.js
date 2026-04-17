import { prisma } from '../db.js';
import { createAuditLog, getAuditContext } from '../audit.js';

const ENTITY = 'AgentRequest';
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB per file (base64 decoded)

function decodeBase64Size(dataBase64) {
  if (!dataBase64 || typeof dataBase64 !== 'string') return 0;
  const len = dataBase64.length;
  const padding = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

async function appendAgentAudit(requestId, userId, action, beforeValue, afterValue) {
  await prisma.agentAuditEvent.create({
    data: {
      requestId,
      userId,
      action,
      beforeValue: beforeValue ?? undefined,
      afterValue: afterValue ?? undefined,
    },
  });
}

async function appendRunLog(requestId, actorType, message, metadata = null) {
  await prisma.agentRunLog.create({
    data: {
      requestId,
      actorType,
      message,
      metadata: metadata ?? undefined,
    },
  });
}

/**
 * Build normalized workflow graph from intake (explicit states/transitions for auditability).
 */
async function createWorkflowGraph(tx, { agentRequestId, name, objective, triggerEvent, outputType, graphNotes }) {
  const def = await tx.workflowDefinition.create({
    data: {
      agentRequestId,
      name,
      objective,
      triggerEvent: triggerEvent ?? null,
      outputType,
      graphNotes: graphNotes ?? undefined,
    },
  });

  const states = [
    { stateKey: 'intake', label: 'Intake recorded', sortOrder: 0 },
    { stateKey: 'design', label: 'Design / plan', sortOrder: 1 },
    { stateKey: 'implementation', label: 'Implementation (human-controlled)', sortOrder: 2 },
    { stateKey: 'verification', label: 'Verification & release readiness', sortOrder: 3 },
    { stateKey: 'effective', label: 'Effective in QMS', sortOrder: 4 },
  ];
  await tx.workflowState.createMany({
    data: states.map((s) => ({
      definitionId: def.id,
      stateKey: s.stateKey,
      label: s.label,
      sortOrder: s.sortOrder,
    })),
  });

  const transitions = [
    { from: 'intake', to: 'design', label: 'Approve design', rolesJson: [] },
    { from: 'design', to: 'implementation', label: 'Approve build', rolesJson: [] },
    { from: 'implementation', to: 'verification', label: 'Ready for verification', rolesJson: [] },
    { from: 'verification', to: 'effective', label: 'Authorized release', rolesJson: [] },
  ];
  await tx.workflowTransition.createMany({
    data: transitions.map((t) => ({
      definitionId: def.id,
      fromStateKey: t.from,
      toStateKey: t.to,
      label: t.label,
      rolesJson: t.rolesJson,
    })),
  });

  return def;
}

export async function createSuggestUpdateRequest({ userId, body, req }) {
  const attachments = body.attachments || [];
  for (const a of attachments) {
    const sz = decodeBase64Size(a.dataBase64);
    if (sz > MAX_ATTACHMENT_BYTES) {
      const err = new Error(`Attachment too large: ${a.fileName}`);
      err.code = 'ATTACHMENT_TOO_LARGE';
      throw err;
    }
  }

  const suggestUpdateJson = {
    componentName: body.componentName ?? null,
    capturedAt: new Date().toISOString(),
  };

  const title = `${body.moduleName} — update request`;

  const request = await prisma.$transaction(async (tx) => {
    const r = await tx.agentRequest.create({
      data: {
        createdById: userId,
        type: 'SUGGEST_UPDATE',
        status: 'SUBMITTED',
        priority: body.priority,
        title,
        routePath: body.routePath,
        moduleName: body.moduleName,
        componentName: body.componentName ?? null,
        description: body.description,
        businessReason: body.businessReason,
        suggestUpdateJson,
      },
    });
    if (attachments.length) {
      await tx.agentAttachment.createMany({
        data: attachments.map((a) => ({
          requestId: r.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: decodeBase64Size(a.dataBase64),
          dataBase64: a.dataBase64,
        })),
      });
    }
    await appendAgentAudit(r.id, userId, 'REQUEST_CREATED', null, {
      type: r.type,
      status: r.status,
      title: r.title,
    });
    await appendRunLog(r.id, 'USER', 'Suggest update request submitted', { routePath: body.routePath });
    return r;
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId,
    action: 'AGENT_REQUEST_CREATED',
    entityType: ENTITY,
    entityId: request.id,
    afterValue: { type: request.type, status: request.status, moduleName: request.moduleName },
    reason: body.businessReason?.slice(0, 500) || null,
    ...auditCtx,
  });

  return request;
}

export async function createBuildWorkflowRequest({ userId, body, req }) {
  const attachments = body.attachments || [];
  for (const a of attachments) {
    const sz = decodeBase64Size(a.dataBase64);
    if (sz > MAX_ATTACHMENT_BYTES) {
      const err = new Error(`Attachment too large: ${a.fileName}`);
      err.code = 'ATTACHMENT_TOO_LARGE';
      throw err;
    }
  }

  const buildWorkflowJson = {
    triggerEvent: body.triggerEvent,
    requiredRoles: body.requiredRoles,
    approvalSteps: body.approvalSteps,
    notificationNeeds: body.notificationNeeds,
    auditTrailRequirements: body.auditTrailRequirements,
    trainingLinkageRequired: body.trainingLinkageRequired,
    periodicReviewRequired: body.periodicReviewRequired,
    outputType: body.outputType,
    capturedAt: new Date().toISOString(),
  };

  const title = body.workflowName;
  const description = body.objective;

  const request = await prisma.$transaction(async (tx) => {
    const r = await tx.agentRequest.create({
      data: {
        createdById: userId,
        type: 'BUILD_WORKFLOW',
        status: 'SUBMITTED',
        priority: body.priority,
        title,
        routePath: null,
        moduleName: 'Workflow',
        componentName: null,
        description,
        businessReason: body.businessReason,
        buildWorkflowJson,
      },
    });

    await createWorkflowGraph(tx, {
      agentRequestId: r.id,
      name: body.workflowName,
      objective: body.objective,
      triggerEvent: body.triggerEvent,
      outputType: body.outputType,
      graphNotes: {
        requiredRoles: body.requiredRoles,
        approvalSteps: body.approvalSteps,
        notificationNeeds: body.notificationNeeds,
        auditTrailRequirements: body.auditTrailRequirements,
        trainingLinkageRequired: body.trainingLinkageRequired,
        periodicReviewRequired: body.periodicReviewRequired,
      },
    });

    if (attachments.length) {
      await tx.agentAttachment.createMany({
        data: attachments.map((a) => ({
          requestId: r.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: decodeBase64Size(a.dataBase64),
          dataBase64: a.dataBase64,
        })),
      });
    }

    await appendAgentAudit(r.id, userId, 'REQUEST_CREATED', null, {
      type: r.type,
      status: r.status,
      title: r.title,
    });
    await appendRunLog(r.id, 'USER', 'Build workflow request submitted', { outputType: body.outputType });
    return r;
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId,
    action: 'AGENT_REQUEST_CREATED',
    entityType: ENTITY,
    entityId: request.id,
    afterValue: { type: request.type, status: request.status, title: request.title },
    reason: body.businessReason?.slice(0, 500) || null,
    ...auditCtx,
  });

  return request;
}

export async function listAgentRequests(filters) {
  const where = {};
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.moduleName) {
    where.moduleName = { contains: filters.moduleName, mode: 'insensitive' };
  }
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }

  const [items, total] = await Promise.all([
    prisma.agentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
      select: {
        id: true,
        type: true,
        status: true,
        priority: true,
        title: true,
        moduleName: true,
        routePath: true,
        createdAt: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.agentRequest.count({ where }),
  ]);
  return { items, total };
}

export async function getAgentRequestById(id) {
  return prisma.agentRequest.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      attachments: true,
      workflowDefinition: {
        include: {
          states: { orderBy: { sortOrder: 'asc' } },
          transitions: true,
        },
      },
      runLogs: { orderBy: { createdAt: 'desc' }, take: 100 },
      auditEvents: { orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { firstName: true, lastName: true, email: true } } } },
    },
  });
}

export async function updateAgentRequestStatus({ id, userId, status, reason, req }) {
  const existing = await prisma.agentRequest.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Request not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const before = { status: existing.status };
  const after = { status, reason: reason ?? null };

  await prisma.$transaction(async (tx) => {
    await tx.agentRequest.update({
      where: { id },
      data: { status },
    });
    await appendAgentAudit(id, userId, 'STATUS_CHANGED', before, after);
    await appendRunLog(id, 'USER', `Status set to ${status}`, { reason: reason ?? null });
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId,
    action: 'AGENT_REQUEST_STATUS_CHANGED',
    entityType: ENTITY,
    entityId: id,
    beforeValue: before,
    afterValue: after,
    reason: reason ?? null,
    ...auditCtx,
  });

  return getAgentRequestById(id);
}

/** MCP / automation: open requests not yet completed (no execution side-effects). */
export async function listOpenRequestsForMcp({ take = 100 } = {}) {
  return prisma.agentRequest.findMany({
    where: {
      status: { in: ['SUBMITTED', 'APPROVED_FOR_IMPLEMENTATION', 'PLANNED', 'IN_PROGRESS'] },
    },
    orderBy: { createdAt: 'asc' },
    take,
    select: {
      id: true,
      type: true,
      status: true,
      priority: true,
      title: true,
      moduleName: true,
      routePath: true,
      description: true,
      businessReason: true,
      suggestUpdateJson: true,
      buildWorkflowJson: true,
      createdAt: true,
      workflowDefinition: {
        select: {
          id: true,
          name: true,
          objective: true,
          outputType: true,
          states: { select: { stateKey: true, label: true, sortOrder: true } },
          transitions: {
            select: { fromStateKey: true, toStateKey: true, label: true, rolesJson: true },
          },
        },
      },
    },
  });
}
