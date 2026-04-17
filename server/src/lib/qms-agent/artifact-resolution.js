/** Standard metadata keys for agent outputs (MCP / human logging). */
export const ARTIFACT_TYPES = {
  IMPLEMENTATION_PLAN: 'IMPLEMENTATION_PLAN',
  WORKFLOW_SPEC: 'WORKFLOW_SPEC',
  SCHEMA_PLAN: 'SCHEMA_PLAN',
};

/**
 * @param {Array<{ id: string, createdAt: Date|string, message: string, metadata: unknown }>} runLogs
 * @param {string} artifactType
 */
export function findLatestArtifactLog(runLogs, artifactType) {
  if (!Array.isArray(runLogs) || runLogs.length === 0) return null;
  const sorted = [...runLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const log of sorted) {
    const meta = log.metadata && typeof log.metadata === 'object' ? log.metadata : null;
    if (meta) {
      if (meta.artifactType === artifactType || meta.kind === artifactType) return log;
      if (artifactType === ARTIFACT_TYPES.IMPLEMENTATION_PLAN && meta.implementationPlan) return log;
      if (artifactType === ARTIFACT_TYPES.WORKFLOW_SPEC && meta.workflowSpec) return log;
      if (artifactType === ARTIFACT_TYPES.SCHEMA_PLAN && meta.schemaPlan) return log;
    }
    const msg = (log.message || '').toLowerCase();
    if (artifactType === ARTIFACT_TYPES.IMPLEMENTATION_PLAN && msg.includes('implementation plan')) return log;
    if (artifactType === ARTIFACT_TYPES.WORKFLOW_SPEC && (msg.includes('workflow spec') || msg.includes('workflow specification')))
      return log;
    if (artifactType === ARTIFACT_TYPES.SCHEMA_PLAN && (msg.includes('schema plan') || msg.includes('migration plan')))
      return log;
  }
  return null;
}

/**
 * Extract structured artifact body from a run log (metadata-first).
 * @param {import('@prisma/client').AgentRunLog | null} log
 * @param {string} artifactType
 */
export function extractArtifactPayload(log, artifactType) {
  if (!log) return null;
  const meta = log.metadata && typeof log.metadata === 'object' ? { ...log.metadata } : {};
  if (artifactType === ARTIFACT_TYPES.IMPLEMENTATION_PLAN) {
    if (meta.implementationPlan) return meta.implementationPlan;
    if (meta.plan) return meta.plan;
  }
  if (artifactType === ARTIFACT_TYPES.WORKFLOW_SPEC) {
    if (meta.workflowSpec) return meta.workflowSpec;
    if (meta.workflow) return meta.workflow;
  }
  if (artifactType === ARTIFACT_TYPES.SCHEMA_PLAN) {
    if (meta.schemaPlan) return meta.schemaPlan;
    if (meta.schema) return meta.schema;
  }
  return meta && Object.keys(meta).length ? meta : { message: log.message, loggedAt: log.createdAt };
}
