/**
 * @typedef {{ id: string, text: string, category: string }} ChecklistItem
 */

/**
 * @param {import('@prisma/client').AgentRequest & { workflowDefinition?: unknown }} request
 * @param {import('./module-registry/types.js').QmsModuleDefinition | null} [moduleDef]
 * @returns {ChecklistItem[]}
 */
export function generateExecutionChecklist(request, moduleDef = null) {
  /** @type {ChecklistItem[]} */
  const items = [];
  let i = 0;
  const add = (category, text) => {
    i += 1;
    items.push({ id: `chk-${i}`, category, text });
  };

  const type = request.type;
  const outputType = request.workflowDefinition?.outputType;

  if (type === 'SUGGEST_UPDATE' || outputType === 'UI' || outputType === 'FULL_SCAFFOLD') {
    add('ui', 'Route / primary component reviewed for the requested change.');
    add('ui', 'Affected files and ownership boundaries identified.');
    add('ui', 'Role permissions and admin-only surfaces validated for the change.');
    add('ui', 'Audit trail / logging impact reviewed (who did what, when).');
    add('ui', 'Validation rules and user-visible error states considered.');
    add('ui', 'Regression risk reviewed (happy path + edge cases).');
  }

  if (type === 'BUILD_WORKFLOW' || outputType === 'PLAN' || outputType === 'FULL_SCAFFOLD') {
    add('workflow', 'Workflow states are explicit, named, and cover start/end conditions.');
    add('workflow', 'Transitions are validated (no orphan states, illegal jumps).');
    add('workflow', 'Approval chain matches policy (segregation of duties where required).');
    add('workflow', 'Role mapping confirmed for each transition.');
    add('workflow', 'Notification triggers defined (who gets notified, on which events).');
    add('workflow', 'Training linkage defined when workflow changes affect competency.');
    add('workflow', 'Effective-date / rollout logic defined (if applicable).');
    add('workflow', 'Audit trail requirements confirmed (immutable history, reasons).');
  }

  if (outputType === 'SCHEMA' || outputType === 'FULL_SCAFFOLD') {
    add('schema', 'Non-destructive schema strategy confirmed (additive-first).');
    add('schema', 'Migration reviewed for safety, rollback, and ordering.');
    add('schema', 'Backwards compatibility considered for existing rows/APIs.');
    add('schema', 'Seed / backfill needs reviewed (defaults, nullable columns).');
    add('schema', 'Index / performance impact reviewed for hot paths.');
  }

  if (items.length === 0) {
    add('general', 'Approved scope re-read against intake description and business reason.');
    add('general', 'Human implementation plan exists and is traceable to this package.');
  }

  if (moduleDef?.commonAuditRequirements?.length) {
    add('module', `[${moduleDef.moduleKey}] Audit expectations: ${moduleDef.commonAuditRequirements.slice(0, 3).join('; ')}`);
  }
  if (moduleDef?.commonTrainingLinkageRules?.length) {
    add('module', `[${moduleDef.moduleKey}] Training linkage: ${moduleDef.commonTrainingLinkageRules.slice(0, 2).join('; ')}`);
  }

  return items;
}
