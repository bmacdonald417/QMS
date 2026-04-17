import { suggestWorkflowTemplates } from './workflow-templates/index.js';
import { getWorkflowTemplate } from './workflow-templates/index.js';

const GENERIC_STATES = [
  { stateKey: 'intake', label: 'Intake recorded', sortOrder: 0 },
  { stateKey: 'design', label: 'Design / plan', sortOrder: 1 },
  { stateKey: 'implementation', label: 'Implementation (human-controlled)', sortOrder: 2 },
  { stateKey: 'verification', label: 'Verification & release readiness', sortOrder: 3 },
  { stateKey: 'effective', label: 'Effective in QMS', sortOrder: 4 },
];

const GENERIC_TRANSITIONS = [
  { from: 'intake', to: 'design', label: 'Approve design', rolesJson: [] },
  { from: 'design', to: 'implementation', label: 'Approve build', rolesJson: [] },
  { from: 'implementation', to: 'verification', label: 'Ready for verification', rolesJson: [] },
  { from: 'verification', to: 'effective', label: 'Authorized release', rolesJson: [] },
];

/**
 * Create workflow definition graph using a template when confident; otherwise generic scaffold.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   agentRequestId: string;
 *   name: string;
 *   objective: string;
 *   triggerEvent: string | null | undefined;
 *   outputType: 'PLAN' | 'SCHEMA' | 'UI' | 'FULL_SCAFFOLD';
 *   graphNotes: Record<string, unknown> | null | undefined;
 *   templateKeyHint?: string | null;
 *   intakeText?: string;
 * }} params
 */
export async function createWorkflowGraphForRequest(tx, params) {
  const {
    agentRequestId,
    name,
    objective,
    triggerEvent,
    outputType,
    graphNotes,
    templateKeyHint,
    intakeText,
  } = params;

  let template = templateKeyHint ? getWorkflowTemplate(templateKeyHint) : null;
  if (!template && intakeText) {
    const ranked = suggestWorkflowTemplates({ text: intakeText, moduleHint: null });
    template = ranked[0] && ranked[0].score >= 4 ? ranked[0].template : null;
  }

  const mergedNotes = {
    ...(graphNotes && typeof graphNotes === 'object' ? graphNotes : {}),
    workflowTemplateKey: template?.templateKey ?? null,
    workflowTemplateName: template?.templateName ?? null,
    templateMatched: Boolean(template),
  };

  const def = await tx.workflowDefinition.create({
    data: {
      agentRequestId,
      name,
      objective,
      triggerEvent: triggerEvent ?? null,
      outputType,
      graphNotes: mergedNotes,
    },
  });

  const states = template ? template.defaultStates : GENERIC_STATES;
  await tx.workflowState.createMany({
    data: states.map((s) => ({
      definitionId: def.id,
      stateKey: s.stateKey,
      label: s.label,
      sortOrder: s.sortOrder,
    })),
  });

  const transitions = template ? template.defaultTransitions : GENERIC_TRANSITIONS;
  await tx.workflowTransition.createMany({
    data: transitions.map((t) => ({
      definitionId: def.id,
      fromStateKey: t.from,
      toStateKey: t.to,
      label: t.label ?? null,
      rolesJson: t.rolesJson ?? [],
    })),
  });

  return { definition: def, templateUsed: template };
}
