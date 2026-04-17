/**
 * @param {import('@prisma/client').AgentRequest & { workflowDefinition?: { outputType?: string } | null }} request
 * @param {{ hasPlan: boolean; hasWorkflow: boolean; hasSchema: boolean }} flags
 */
export function derivePackageType(request, flags) {
  const outputType = request.workflowDefinition?.outputType;
  const ui =
    request.type === 'SUGGEST_UPDATE' || outputType === 'UI' || outputType === 'FULL_SCAFFOLD';
  const wf =
    request.type === 'BUILD_WORKFLOW' ||
    outputType === 'PLAN' ||
    outputType === 'FULL_SCAFFOLD' ||
    flags.hasWorkflow;
  const sc = outputType === 'SCHEMA' || outputType === 'FULL_SCAFFOLD' || flags.hasSchema;

  const n = [ui, wf, sc].filter(Boolean).length;
  if (n >= 2) return 'MIXED';
  if (ui) return 'UI_CHANGE';
  if (wf) return 'WORKFLOW_BUILD';
  if (sc) return 'SCHEMA_CHANGE';
  return 'MIXED';
}
