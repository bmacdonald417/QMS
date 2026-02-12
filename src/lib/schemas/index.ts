import { z } from 'zod';

/** GxP-style required string: non-empty, trimmed */
export const requiredString = z.string().min(1, 'Required').trim();

/** Document lifecycle states */
export const documentStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'EFFECTIVE',
  'OBSOLETE',
]);

/** Document metadata for Document Control */
export const documentSchema = z.object({
  id: z.string(),
  title: requiredString,
  documentId: requiredString,
  versionMajor: z.number().int().min(1),
  versionMinor: z.number().int().min(0),
  status: documentStatusSchema,
  documentType: requiredString,
  authorId: z.string(),
  effectiveDate: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** CAPA workflow stages */
export const capaStageSchema = z.enum([
  'initiation',
  'investigation',
  'root_cause',
  'action_plan',
  'verification',
  'closed',
]);

export const capaSchema = z.object({
  id: z.string(),
  title: requiredString,
  stage: capaStageSchema,
  sourceType: z.enum(['audit_finding', 'deviation', 'complaint', 'other']),
  sourceId: z.string().optional(),
  openedAt: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  owner: requiredString,
});

/** Change control impact assessment */
export const changeControlSchema = z.object({
  id: z.string(),
  title: requiredString,
  description: requiredString,
  impactAssessment: requiredString,
  status: z.enum(['draft', 'review', 'approved', 'rejected', 'implemented']),
  requestedBy: requiredString,
  requestedAt: z.string().datetime(),
});

/** FMEA / Risk — RPN components 1–10 */
export const rpnScore = z.number().int().min(1).max(10);
export const riskItemSchema = z.object({
  id: z.string(),
  failureMode: requiredString,
  severity: rpnScore,
  occurrence: rpnScore,
  detection: rpnScore,
  rpn: z.number().int(), // severity * occurrence * detection
  actions: z.string().optional(),
});

export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type DocumentRecord = z.infer<typeof documentSchema>;
export type CAPAStage = z.infer<typeof capaStageSchema>;
export type CAPARecord = z.infer<typeof capaSchema>;
export type ChangeControlRecord = z.infer<typeof changeControlSchema>;
export type RiskItem = z.infer<typeof riskItemSchema>;
