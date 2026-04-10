import { z } from 'zod';

export const fiveWhyStepSchema = z.object({
  level: z.number().int().min(1).max(20),
  question: z.string().optional().nullable(),
  answer: z.string().min(1),
  evidenceRef: z.string().optional().nullable(),
  isRootCauseCandidate: z.boolean().optional(),
});

export const fishboneCauseSchema = z.object({
  category: z.string().min(1),
  cause: z.string().min(1),
  evidenceRef: z.string().optional().nullable(),
});

export const rcaJsonSchema = z.object({
  version: z.number().int().optional().default(1),
  fiveWhys: z.array(fiveWhyStepSchema).default([]),
  fishbone: z
    .object({
      categories: z.array(z.string()).default([]),
      causes: z.array(fishboneCauseSchema).default([]),
    })
    .default({ categories: [], causes: [] }),
});

export function parseRcaJson(input) {
  return rcaJsonSchema.safeParse(input ?? {});
}

export function normalizeRcaJson(input) {
  const parsed = parseRcaJson(input);
  if (!parsed.success) return { ok: false, error: parsed.error.flatten(), data: null };
  return { ok: true, error: null, data: parsed.data };
}

export function hasStructuredRcaContent(rca) {
  const parsed = parseRcaJson(rca);
  if (!parsed.success) return false;
  const v = parsed.data;
  return (
    (Array.isArray(v.fiveWhys) && v.fiveWhys.length > 0) ||
    (Array.isArray(v.fishbone?.causes) && v.fishbone.causes.length > 0)
  );
}

export function defaultRcaJson() {
  return { version: 1, fiveWhys: [], fishbone: { categories: [], causes: [] } };
}
