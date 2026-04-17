import { getQmsModule, listQmsModules } from './module-registry/index.js';
import {
  getWorkflowTemplate,
  mergeRequestContextWithTemplate,
  suggestWorkflowTemplates,
} from './workflow-templates/index.js';

/** @type {Record<string, string[]>} */
const MODULE_KEYWORDS = {
  'document-control': ['document', 'sop', 'policy', 'revision', 'documentcontrol', 'controlled document', '/documents', 'document detail', 'pdf'],
  training: ['training', 'competency', 'module', 'assigned', 'completion', '/training', 'read-and-understood'],
  capa: ['capa', 'corrective', 'preventive', 'root cause', 'effectiveness', 'containment', '/capas'],
  'change-control': ['change control', 'change-control', '/change-control', 'ecc', 'change request', 'implementation plan'],
  'supplier-quality': ['supplier', 'vendor', 'qualification', 'sqe', 'scar', '/suppliers'],
  'audit-management': ['audit', 'finding', 'auditor', '/audits', 'ncr'],
  deviation: ['deviation', 'nonconformance', 'disposition', 'lot', 'batch'],
  'risk-management': ['risk', 'fmea', 'hazard', 'mitigation', 'residual', '/risk'],
};

/**
 * @param {import('@prisma/client').AgentRequest} request
 * @returns {{ inferredModuleKey: string | null, scores: Record<string, number> }}
 */
export function inferModuleKeyFromRequest(request) {
  const text = [
    request.title,
    request.description,
    request.businessReason,
    request.moduleName,
    request.routePath,
    request.type === 'BUILD_WORKFLOW' ? JSON.stringify(request.buildWorkflowJson ?? {}) : '',
    request.type === 'SUGGEST_UPDATE' ? JSON.stringify(request.suggestUpdateJson ?? {}) : '',
  ]
    .join(' ')
    .toLowerCase();

  /** @type {Record<string, number>} */
  const scores = {};
  for (const mod of listQmsModules()) {
    let s = 0;
    const kws = MODULE_KEYWORDS[mod.moduleKey] || [];
    for (const kw of kws) {
      if (kw && text.includes(kw)) s += 3;
    }
    if (request.moduleName && mod.displayName && request.moduleName.toLowerCase().includes(mod.displayName.toLowerCase())) {
      s += 6;
    }
    if (request.routePath) {
      const rp = request.routePath.toLowerCase();
      if (mod.moduleKey === 'document-control' && rp.includes('document')) s += 4;
      if (mod.moduleKey === 'training' && rp.includes('training')) s += 4;
      if (mod.moduleKey === 'capa' && rp.includes('capa')) s += 4;
      if (mod.moduleKey === 'change-control' && rp.includes('change')) s += 4;
      if (mod.moduleKey === 'supplier-quality' && rp.includes('supplier')) s += 4;
      if (mod.moduleKey === 'audit-management' && rp.includes('audit')) s += 4;
      if (mod.moduleKey === 'risk-management' && rp.includes('risk')) s += 4;
    }
    scores[mod.moduleKey] = s;
  }

  let bestKey = null;
  let best = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > best) {
      best = v;
      bestKey = k;
    }
  }
  if (best < 3) return { inferredModuleKey: null, scores };
  return { inferredModuleKey: bestKey, scores };
}

/**
 * @param {import('@prisma/client').AgentRequest} request
 * @param {string | null} inferredModuleKey
 * @param {string | null} templateOverride
 */
export function suggestTemplateKeyFromRequest(request, inferredModuleKey, templateOverride) {
  if (templateOverride && getWorkflowTemplate(templateOverride)) return templateOverride;
  const text = [request.title, request.description, request.businessReason].join(' ');
  const ranked = suggestWorkflowTemplates({ text, moduleHint: inferredModuleKey ?? undefined });
  const top = ranked.find((r) => r.score > 0)?.template ?? ranked[0]?.template;
  return top?.templateKey ?? null;
}

/**
 * @param {{
 *   request: import('@prisma/client').AgentRequest & { workflowDefinition?: unknown };
 *   packageType: string;
 *   inferredModuleKey: string | null;
 *   effectiveModuleKey: string | null;
 *   suggestedTemplateKey: string | null;
 *   effectiveTemplateKey: string | null;
 * }} params
 */
export function buildExecutionIntelligence({
  request,
  packageType,
  inferredModuleKey,
  effectiveModuleKey,
  suggestedTemplateKey,
  effectiveTemplateKey,
  scores: scoresIn,
}) {
  const mod = effectiveModuleKey ? getQmsModule(effectiveModuleKey) : null;
  const template = effectiveTemplateKey ? getWorkflowTemplate(effectiveTemplateKey) : null;

  const affectedEntities = mod?.commonEntities ? [...mod.commonEntities] : [];
  const affectedUiAreas = mod?.commonUIAreas ? [...mod.commonUIAreas] : [];
  if (request.routePath) affectedUiAreas.push(`Route: ${request.routePath}`);

  const affectedSchemaAreas = mod?.commonSchemaPatterns ? [...mod.commonSchemaPatterns] : [];
  if (request.workflowDefinition?.outputType === 'SCHEMA' || request.workflowDefinition?.outputType === 'FULL_SCAFFOLD') {
    affectedSchemaAreas.push('Prisma migrations under server/prisma/migrations');
  }

  const moduleSpecificRisks = mod?.commonRisks ? [...mod.commonRisks] : [];
  if (template?.auditRequirements?.length) {
    moduleSpecificRisks.push(`Template "${template.templateName}" audit focus: ${template.auditRequirements[0]}`);
  }

  /** @type {string[]} */
  const validationChecklistAdditions = [];
  if (mod?.validationHints?.length) {
    for (const h of mod.validationHints) {
      validationChecklistAdditions.push(`[${mod.moduleKey}] ${h}`);
    }
  }
  if (template?.auditRequirements?.length) {
    for (const a of template.auditRequirements) {
      validationChecklistAdditions.push(`[template:${template.templateKey}] ${a}`);
    }
  }

  const engineeringNotes = [];
  if (mod) {
    engineeringNotes.push(`Primary QMS module: ${mod.displayName} — ${mod.description}`);
    engineeringNotes.push(`Common workflow patterns: ${mod.commonWorkflowPatterns.join('; ')}`);
  }
  if (template) {
    engineeringNotes.push(`Suggested workflow template: ${template.templateName} (${template.templateKey})`);
    engineeringNotes.push(`Approval model: ${template.approvalModel}`);
  }
  engineeringNotes.push(`Package type: ${packageType}. Prefer additive, typed, audited changes.`);

  const acceptanceCriteria = [];
  if (mod) {
    acceptanceCriteria.push(`Role-sensitive flows respect: ${mod.commonRoles.slice(0, 6).join(', ')}`);
    acceptanceCriteria.push(`Lifecycle statuses align with: ${mod.commonStatuses.slice(0, 8).join(', ')}`);
  }
  if (template) {
    acceptanceCriteria.push(`Template states/transitions are reflected or explicitly diverged with rationale.`);
  }
  acceptanceCriteria.push('Audit logs / agent run logs remain coherent after changes.');

  const scores = scoresIn ?? inferModuleKeyFromRequest(request).scores;

  const mergedTemplateContext = template
    ? mergeRequestContextWithTemplate(template, {
        requestId: request.id,
        title: request.title,
        priority: request.priority,
        routePath: request.routePath,
        moduleName: request.moduleName,
        buildWorkflowJson: request.buildWorkflowJson ?? undefined,
      })
    : null;

  return {
    module: mod
      ? {
          moduleKey: mod.moduleKey,
          displayName: mod.displayName,
          description: mod.description,
          commonEntities: mod.commonEntities,
          commonRoles: mod.commonRoles,
          commonStatuses: mod.commonStatuses,
          commonWorkflowPatterns: mod.commonWorkflowPatterns,
          commonAuditRequirements: mod.commonAuditRequirements,
          commonTrainingLinkageRules: mod.commonTrainingLinkageRules,
          commonNotificationPatterns: mod.commonNotificationPatterns,
          commonUIAreas: mod.commonUIAreas,
          commonSchemaPatterns: mod.commonSchemaPatterns,
          commonRisks: mod.commonRisks,
          validationHints: mod.validationHints,
        }
      : {
          moduleKey: 'unknown',
          displayName: 'Unknown / cross-cutting',
          description: 'No confident module inference; use human judgement.',
          commonEntities: [],
          commonRoles: [],
          commonStatuses: [],
          commonWorkflowPatterns: [],
          commonAuditRequirements: [],
          commonTrainingLinkageRules: [],
          commonNotificationPatterns: [],
          commonUIAreas: [],
          commonSchemaPatterns: [],
          commonRisks: [],
          validationHints: [],
        },
    suggestedTemplate: mergedTemplateContext,
    inferredModuleKey,
    suggestedTemplateKey,
    effectiveModuleKey,
    effectiveTemplateKey,
    affectedEntities,
    affectedUiAreas,
    likelyBackendTouchpoints: inferBackendTouchpoints(request, mod),
    affectedSchemaAreas,
    moduleSpecificRisks,
    validationChecklistAdditions,
    engineeringNotes,
    acceptanceCriteria,
    inferenceScores: scores,
  };
}

/**
 * @param {import('@prisma/client').AgentRequest} request
 * @param {import('./module-registry/types.js').QmsModuleDefinition | null} mod
 */
function inferBackendTouchpoints(request, mod) {
  /** @type {string[]} */
  const out = ['server/src/audit.js', 'server/src/auth.js'];
  if (mod?.moduleKey === 'document-control') out.push('server/src/documents.js');
  if (mod?.moduleKey === 'training') out.push('server/src/training.js');
  if (mod?.moduleKey === 'capa') out.push('server/src/capas.js');
  if (mod?.moduleKey === 'change-control') out.push('server/src/changeControls.js');
  if (mod?.moduleKey === 'audit-management') out.push('server/src/audits.js');
  if (request.type === 'BUILD_WORKFLOW') out.push('server/src/agent/agentService.js');
  return out;
}

/**
 * @param {import('@prisma/client').AgentRequest} request
 * @param {string | null} moduleKeyOverride
 * @param {string | null} templateKeyOverride
 */
export function resolveIntelligenceKeys(request, moduleKeyOverride, templateKeyOverride) {
  const { inferredModuleKey, scores } = inferModuleKeyFromRequest(request);
  const effectiveModuleKey = moduleKeyOverride || inferredModuleKey;
  const suggestedTemplateKey = suggestTemplateKeyFromRequest(request, effectiveModuleKey, null);
  const effectiveTemplateKey = templateKeyOverride || suggestedTemplateKey;
  return { inferredModuleKey, effectiveModuleKey, suggestedTemplateKey, effectiveTemplateKey, scores };
}

/**
 * Strip prior intelligence checklist rows and append fresh ones.
 * @param {Array<{ id: string, category: string, text: string }>} checklist
 * @param {string[]} additionsText
 */
export function mergeIntelligenceChecklistItems(checklist, additionsText) {
  const base = (checklist || []).filter((c) => c.category !== 'intelligence');
  const rows = (additionsText || []).map((text, idx) => ({
    id: `chk-int-${idx + 1}`,
    category: 'intelligence',
    text,
  }));
  return [...base, ...rows];
}
