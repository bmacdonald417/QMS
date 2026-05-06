// Zod schemas for the v2.1 codex CMMC governance-doc contract.
//
// These schemas describe the response shapes for:
//   GET /api/v1/cmmc/controls/:controlId/documents   (per-control)
//   GET /api/v1/cmmc/controls/documents?control_ids= (bulk)
//
// Endpoint handlers in server/src/cmmcControls.js (Phase 4) parse outbound
// responses through these schemas as a belt-and-suspenders contract guard
// before the JSON leaves the process. Codex's typed client mirrors these
// shapes; if QMS drifts the schema fails first.

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// shared enums (must mirror the rollups in governanceContract.js)
// ─────────────────────────────────────────────────────────────────────────────

export const docKindSchema = z.enum([
  'policy',
  'procedure',
  'sop',
  'plan',
  'form',
  'reference',
  'other',
]);

export const sourceSchema = z.enum(['qms_managed', 'cmmc_bundle']);

export const approvalStatusSchema = z.enum([
  'effective',
  'pending',
  'draft',
  'retired',
]);

export const reviewCycleStatusSchema = z.enum([
  'current',
  'due_soon',
  'overdue',
  'expired',
]);

export const controlCoverageStatusSchema = z.enum([
  'complete',
  'partial',
  'absent',
]);

// ─────────────────────────────────────────────────────────────────────────────
// document row
// ─────────────────────────────────────────────────────────────────────────────

// All Date-typed fields are emitted as ISO 8601 strings in the JSON response.
// Zod parses ISO strings back to Date objects when validating inbound payloads
// (codex side); this schema describes the wire shape.
const isoDateString = z.string().datetime({ offset: true });

export const contractDocumentSchema = z.object({
  doc_id: z.string(), // human code, e.g. MAC-POL-210
  doc_uuid: z.string(), // row UUID; audit/join only
  source: sourceSchema,
  title: z.string(),
  doc_kind: docKindSchema,
  qms_doc_type: z.string(), // raw passthrough for debug/audit
  current_version: z.string().nullable(),
  current_version_effective_date: isoDateString.nullable(),
  last_reviewed_at: isoDateString.nullable(),
  next_review_due_at: isoDateString.nullable(),
  cadence_label: z.string().nullable(),
  review_cycle_status: reviewCycleStatusSchema,
  approver_name: z.string().nullable(),
  approval_status: approvalStatusSchema,
  qms_native_status: z.string(), // raw Document.status / CmmcDocument.status enum value
  permalink: z.string().url(),
  control_coverage_note: z.string().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// per-control summary (also emitted by the bulk endpoint)
// ─────────────────────────────────────────────────────────────────────────────

export const controlSummarySchema = z.object({
  documents_present: z.number().int().nonnegative(),
  documents_current: z.number().int().nonnegative(),
  documents_due_soon: z.number().int().nonnegative(),
  documents_overdue: z.number().int().nonnegative(),
  control_coverage_status: controlCoverageStatusSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// endpoint envelopes
// ─────────────────────────────────────────────────────────────────────────────

export const perControlResponseSchema = z.object({
  control_id: z.string(),
  documents: z.array(contractDocumentSchema),
  summary: controlSummarySchema,
});

export const bulkResponseSchema = z.object({
  controls: z.array(
    z.object({
      control_id: z.string(),
      summary: controlSummarySchema,
    })
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// inbound query validation (bulk endpoint)
// ─────────────────────────────────────────────────────────────────────────────

// `control_ids=3.1.4,3.2.1,...`. Cap at 50 per v2.1.
const CONTROL_ID_RE = /^\d+(\.\d+)+$/;

export const bulkQuerySchema = z.object({
  control_ids: z
    .string()
    .min(1, 'control_ids is required')
    .transform((raw, ctx) => {
      const ids = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'control_ids must contain at least one id' });
        return z.NEVER;
      }
      if (ids.length > 50) {
        ctx.addIssue({ code: 'custom', message: 'control_ids cap is 50' });
        return z.NEVER;
      }
      for (const id of ids) {
        if (!CONTROL_ID_RE.test(id)) {
          ctx.addIssue({
            code: 'custom',
            message: `invalid control id format: ${id}`,
          });
          return z.NEVER;
        }
      }
      return ids;
    }),
});

export const controlIdParamSchema = z
  .string()
  .regex(CONTROL_ID_RE, 'invalid control id format');
