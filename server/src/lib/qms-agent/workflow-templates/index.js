import { WORKFLOW_TEMPLATES } from './templates-data.js';

export { WORKFLOW_TEMPLATES };

/**
 * @returns {import('./types.js').WorkflowTemplateDefinition[]}
 */
export function listWorkflowTemplates() {
  return WORKFLOW_TEMPLATES;
}

/**
 * @param {string} templateKey
 * @returns {import('./types.js').WorkflowTemplateDefinition | null}
 */
export function getWorkflowTemplate(templateKey) {
  if (!templateKey || typeof templateKey !== 'string') return null;
  return WORKFLOW_TEMPLATES.find((t) => t.templateKey === templateKey) ?? null;
}

/**
 * @param {string} moduleKey
 * @returns {import('./types.js').WorkflowTemplateDefinition[]}
 */
export function listTemplatesForModule(moduleKey) {
  if (!moduleKey) return WORKFLOW_TEMPLATES;
  return WORKFLOW_TEMPLATES.filter((t) => t.targetModules.includes(moduleKey));
}

/**
 * Score templates against free text + module hint.
 * @param {{ text: string, moduleHint?: string|null }} params
 * @returns {{ template: import('./types.js').WorkflowTemplateDefinition, score: number }[]}
 */
export function suggestWorkflowTemplates({ text, moduleHint }) {
  const haystack = `${text || ''} ${moduleHint || ''}`.toLowerCase();
  const scored = WORKFLOW_TEMPLATES.map((template) => {
    let score = 0;
    const blob = [
      template.templateName,
      template.objective,
      template.templateKey,
      ...template.targetModules,
      ...(template.defaultRoles || []),
    ]
      .join(' ')
      .toLowerCase();
    if (moduleHint && template.targetModules.includes(moduleHint)) score += 8;
    for (const token of blob.split(/[^a-z0-9]+/i)) {
      if (token.length >= 4 && haystack.includes(token)) score += 1;
    }
    return { template, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Merge template defaults with explicit request constraints (non-destructive merge for planning).
 * @param {import('./types.js').WorkflowTemplateDefinition} template
 * @param {Record<string, unknown>} requestContext
 */
export function mergeRequestContextWithTemplate(template, requestContext) {
  return {
    templateKey: template.templateKey,
    templateName: template.templateName,
    targetModules: template.targetModules,
    objective: template.objective,
    defaultStates: template.defaultStates,
    defaultTransitions: template.defaultTransitions,
    defaultRoles: template.defaultRoles,
    approvalModel: template.approvalModel,
    auditRequirements: template.auditRequirements,
    notificationRules: template.notificationRules,
    trainingLinkageRules: template.trainingLinkageRules,
    uiRecommendations: template.uiRecommendations,
    schemaRecommendations: template.schemaRecommendations,
    requestContext,
  };
}
