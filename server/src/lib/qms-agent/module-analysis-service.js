import { prisma } from '../../db.js';
import { getQmsModule } from './module-registry/index.js';
import { getWorkflowTemplate, suggestWorkflowTemplates } from './workflow-templates/index.js';
import { resolveIntelligenceKeys } from './intelligence-engine.js';

/**
 * @param {string} agentRequestId
 */
export async function analyzeAgentRequest(agentRequestId) {
  const request = await prisma.agentRequest.findUnique({
    where: { id: agentRequestId },
    include: { workflowDefinition: { include: { states: true, transitions: true } } },
  });
  if (!request) {
    const err = new Error('Agent request not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const resolved = resolveIntelligenceKeys(request, null, null);
  const { inferredModuleKey, suggestedTemplateKey } = resolved;

  const moduleDef = resolved.effectiveModuleKey ? getQmsModule(resolved.effectiveModuleKey) : null;
  const templateDef = suggestedTemplateKey ? getWorkflowTemplate(suggestedTemplateKey) : null;

  const ranked = suggestWorkflowTemplates({
    text: [request.title, request.description, request.businessReason].join(' '),
    moduleHint: inferredModuleKey ?? undefined,
  }).slice(0, 8);

  return {
    requestId: request.id,
    inferredModuleKey,
    suggestedTemplateKey,
    effectiveModuleKey: resolved.effectiveModuleKey,
    effectiveTemplateKey: resolved.effectiveTemplateKey,
    module: moduleDef,
    template: templateDef,
    rankedTemplates: ranked.map((r) => ({ templateKey: r.template.templateKey, score: r.score, name: r.template.templateName })),
    scores: resolved.scores,
  };
}
