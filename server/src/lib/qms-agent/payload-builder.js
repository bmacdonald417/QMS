import { ARTIFACT_TYPES, extractArtifactPayload } from './artifact-resolution.js';

/**
 * @param {{
 *   request: import('@prisma/client').AgentRequest & { workflowDefinition?: unknown };
 *   packageType: string;
 *   checklist: Array<{ id: string; category: string; text: string }>;
 *   tasks: Array<{ title: string; description: string; taskType: string; orderIndex: number }>;
 *   implementationPlan: unknown;
 *   workflowSpec: unknown;
 *   schemaPlan: unknown;
 *   intelligence?: unknown;
 *   implementationReadiness?: unknown;
 * }} params
 */
export function buildExecutionPackagePayload({
  request,
  packageType,
  checklist,
  tasks,
  implementationPlan,
  workflowSpec,
  schemaPlan,
  intelligence,
  implementationReadiness,
}) {
  const approvedScope = [];
  approvedScope.push(`Status: ${request.status} (approved for implementation)`);
  approvedScope.push(request.title);
  if (request.routePath) approvedScope.push(`Route: ${request.routePath}`);
  if (request.moduleName) approvedScope.push(`Module: ${request.moduleName}`);

  const affectedAreas = [];
  if (request.moduleName) affectedAreas.push(request.moduleName);
  if (request.routePath) affectedAreas.push(`Route ${request.routePath}`);
  if (request.type === 'BUILD_WORKFLOW') affectedAreas.push('Workflow engine / approvals / notifications');

  const risks = [];
  if (request.priority === 'CRITICAL' || request.priority === 'HIGH') {
    risks.push('Higher priority: tighten review, testing, and rollback planning.');
  }
  risks.push('Uncontrolled schema mutations can break auditability; prefer additive migrations.');
  risks.push('Workflow changes can impact training, signatures, and evidence retrieval if mis-modeled.');
  if (intelligence && typeof intelligence === 'object' && Array.isArray(intelligence.moduleSpecificRisks)) {
    for (const r of intelligence.moduleSpecificRisks) {
      if (typeof r === 'string' && r.trim()) risks.push(r);
    }
  }

  const constraints = [
    'Governed QMS: preserve audit trails and human authorization gates.',
    'Do not execute agent outputs automatically in production.',
    'Do not make uncontrolled destructive changes (drops, data wipes, irreversible transforms).',
    'Prefer additive, typed, production-safe updates with explicit validation.',
    'Non-destructive schema strategy by default; document any unavoidable destructive step.',
  ];

  return {
    requestSummary: `${request.title}: ${(request.description || '').slice(0, 400)}`,
    packageType,
    approvedScope,
    affectedAreas,
    sourceArtifacts: {
      implementationPlan: implementationPlan ?? undefined,
      workflowSpec: workflowSpec ?? undefined,
      schemaPlan: schemaPlan ?? undefined,
    },
    checklist,
    tasks,
    risks,
    constraints,
    intelligence: intelligence ?? undefined,
    implementationReadiness: implementationReadiness ?? undefined,
  };
}

/**
 * @param {import('@prisma/client').AgentRunLog | null} planLog
 * @param {import('@prisma/client').AgentRunLog | null} wfLog
 * @param {import('@prisma/client').AgentRunLog | null} schemaLog
 */
export function extractSourceArtifacts(planLog, wfLog, schemaLog) {
  return {
    implementationPlan: extractArtifactPayload(planLog, ARTIFACT_TYPES.IMPLEMENTATION_PLAN),
    workflowSpec: extractArtifactPayload(wfLog, ARTIFACT_TYPES.WORKFLOW_SPEC),
    schemaPlan: extractArtifactPayload(schemaLog, ARTIFACT_TYPES.SCHEMA_PLAN),
  };
}
