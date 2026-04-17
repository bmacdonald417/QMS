import { z } from 'zod';

export const agentPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const workflowOutputTypeSchema = z.enum(['PLAN', 'SCHEMA', 'UI', 'FULL_SCAFFOLD']);

export const attachmentInputSchema = z.object({
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(256),
  dataBase64: z.string().min(1),
});

export const suggestUpdateBodySchema = z.object({
  type: z.literal('SUGGEST_UPDATE'),
  routePath: z.string().min(1).max(2048),
  moduleName: z.string().min(1).max(512),
  componentName: z.string().max(512).optional().nullable(),
  description: z.string().min(1).max(50000),
  businessReason: z.string().min(1).max(50000),
  priority: agentPrioritySchema,
  attachments: z.array(attachmentInputSchema).max(5).optional(),
});

export const buildWorkflowBodySchema = z.object({
  type: z.literal('BUILD_WORKFLOW'),
  workflowName: z.string().min(1).max(512),
  objective: z.string().min(1).max(50000),
  triggerEvent: z.string().min(1).max(50000),
  requiredRoles: z.array(z.string().min(1)).min(1).max(50),
  approvalSteps: z.array(z.string().min(1)).min(1).max(50),
  notificationNeeds: z.string().min(1).max(20000),
  auditTrailRequirements: z.string().min(1).max(20000),
  trainingLinkageRequired: z.boolean(),
  periodicReviewRequired: z.boolean(),
  outputType: workflowOutputTypeSchema,
  businessReason: z.string().min(1).max(50000),
  priority: agentPrioritySchema,
  attachments: z.array(attachmentInputSchema).max(5).optional(),
});

export const createAgentRequestSchema = z.discriminatedUnion('type', [
  suggestUpdateBodySchema,
  buildWorkflowBodySchema,
]);

export const agentRequestStatusSchema = z.enum([
  'SUBMITTED',
  'APPROVED_FOR_IMPLEMENTATION',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
]);

export const patchAgentRequestSchema = z.object({
  status: agentRequestStatusSchema,
  reason: z.string().max(5000).optional().nullable(),
});
