/**
 * @param {{
 *   request: Record<string, unknown>;
 *   intelligence: Record<string, unknown> | null;
 *   tasks: Array<{ taskType: string; title: string }>;
 *   workflowDefinition: Record<string, unknown> | null | undefined;
 *   schemaPlan: Record<string, unknown> | null | undefined;
 *   packageType: string;
 * }} ctx
 * @param {Array<{ id: string; category: string }>} acceptanceCriteria
 * @param {Array<Record<string, unknown>>} regressionPlan
 * @param {Record<string, unknown> | null} migrationRiskSummary
 */
export function scoreImplementationReadiness(ctx, acceptanceCriteria, regressionPlan, migrationRiskSummary) {
  const { request, intelligence, tasks, workflowDefinition, schemaPlan, packageType } = ctx;
  const scores = [];

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  const scopeClarity =
    55 +
    (String(request.description || '').trim().length > 200 ? 25 : 10) +
    (request.routePath ? 10 : 0) +
    (request.moduleName ? 10 : 0);
  scores.push({
    key: 'scope_clarity',
    label: 'Scope clarity',
    score: clamp(scopeClarity),
    notes: 'Based on description depth and explicit route/module hints.',
  });

  const inf = (/** @type {any} */ (intelligence))?.inferenceScores || {};
  const bestInference = Object.values(inf).length ? Math.max(...Object.values(inf).map((v) => Number(v) || 0)) : 0;
  const moduleConfidence =
    intelligence && (intelligence.effectiveModuleKey || intelligence.inferredModuleKey)
      ? clamp(60 + Math.min(30, bestInference))
      : 35;
  scores.push({
    key: 'module_confidence',
    label: 'Module confidence',
    score: clamp(moduleConfidence),
    notes: intelligence && intelligence.effectiveModuleKey ? 'Effective module key present.' : 'Module may be underspecified.',
  });

  const templateConfidence =
    intelligence && (intelligence.effectiveTemplateKey || intelligence.suggestedTemplateKey) ? 78 : 42;
  scores.push({
    key: 'template_confidence',
    label: 'Template confidence',
    score: clamp(templateConfidence),
    notes:
      intelligence && intelligence.effectiveTemplateKey ? 'Template locked (override or suggestion).' : 'Template not confidently matched.',
  });

  const states = workflowDefinition && Array.isArray(workflowDefinition.states) ? workflowDefinition.states.length : 0;
  const transitions =
    workflowDefinition && Array.isArray(workflowDefinition.transitions) ? workflowDefinition.transitions.length : 0;
  const workflowCompleteness =
    states + transitions > 0 ? clamp(55 + states * 4 + transitions * 2) : packageType === 'WORKFLOW_BUILD' ? 40 : 62;
  scores.push({
    key: 'workflow_completeness',
    label: 'Workflow completeness',
    score: clamp(workflowCompleteness),
    notes: states ? `Model includes ${states} states and ${transitions} transitions.` : 'Limited workflow model context.',
  });

  const hasSchemaPlan = schemaPlan && typeof schemaPlan === 'object' && Object.keys(schemaPlan).length > 0;
  const schemaReadiness =
    packageType === 'SCHEMA_CHANGE' || packageType === 'MIXED' ? (hasSchemaPlan ? 82 : 48) : hasSchemaPlan ? 70 : 68;
  scores.push({
    key: 'schema_readiness',
    label: 'Schema readiness',
    score: clamp(schemaReadiness),
    notes: hasSchemaPlan ? 'Schema plan artifact present.' : 'Schema plan may be placeholder or absent.',
  });

  const taskTypes = new Set((tasks || []).map((t) => t.taskType));
  const taskCompleteness = clamp(45 + (tasks?.length || 0) * 6 + (taskTypes.has('TESTING') ? 12 : 0) + (taskTypes.has('DATABASE') ? 8 : 0));
  scores.push({
    key: 'task_completeness',
    label: 'Task completeness',
    score: taskCompleteness,
    notes: `Tasks: ${tasks?.length || 0}; coverage types: ${[...taskTypes].join(', ') || 'none'}.`,
  });

  const cats = new Set((acceptanceCriteria || []).map((c) => c.category));
  const acceptanceCompleteness = clamp(40 + cats.size * 8 + Math.min(30, (acceptanceCriteria || []).length * 2));
  scores.push({
    key: 'acceptance_criteria_completeness',
    label: 'Acceptance criteria completeness',
    score: acceptanceCompleteness,
    notes: `${acceptanceCriteria?.length || 0} criteria across ${cats.size} categories.`,
  });

  const riskClarity = migrationRiskSummary ? 80 : packageType === 'SCHEMA_CHANGE' || packageType === 'MIXED' ? 52 : 74;
  scores.push({
    key: 'risk_clarity',
    label: 'Risk clarity',
    score: clamp(riskClarity),
    notes: migrationRiskSummary ? 'Migration risk summary generated.' : 'Limited explicit migration risk narrative.',
  });

  // Handoff completeness is judged by artifact richness at scoring time
  const handoffCompleteness = clamp(50 + (regressionPlan?.length || 0) * 3 + (acceptanceCriteria?.length || 0));
  scores.push({
    key: 'handoff_completeness',
    label: 'Handoff readiness (artifacts)',
    score: Math.min(95, handoffCompleteness),
    notes: 'Proxy: counts of acceptance + regression artifacts (actual handoff is generated later).',
  });

  const weighted =
    scores.reduce((sum, s) => sum + s.score, 0) / Math.max(1, scores.length);

  const score = clamp(weighted);

  /** @type {'LOW' | 'MEDIUM' | 'HIGH' | 'READY'} */
  let band = 'LOW';
  if (score >= 85) band = 'READY';
  else if (score >= 70) band = 'HIGH';
  else if (score >= 50) band = 'MEDIUM';

  const strengths = [];
  const gaps = [];
  const recommendations = [];

  for (const s of scores) {
    if (s.score >= 78) strengths.push(`${s.label} is strong (${s.score}).`);
    if (s.score < 60) {
      gaps.push(`${s.label} is underspecified (${s.score}).`);
      recommendations.push(`Improve ${s.label}: ${s.notes || 'add detail'}`);
    }
  }

  if (!workflowDefinition || !Array.isArray(workflowDefinition.states) || workflowDefinition.states.length === 0) {
    recommendations.push('Attach or regenerate a workflow snapshot so transition testing can be targeted.');
  }
  if ((packageType === 'SCHEMA_CHANGE' || packageType === 'MIXED') && !hasSchemaPlan) {
    recommendations.push('Add a concrete schema plan artifact (models, nullability, indexes, backfill) before execution.');
  }
  if ((acceptanceCriteria || []).length < 10) {
    recommendations.push('Regenerate acceptance criteria after overrides stabilize to widen verification coverage.');
  }
  if ((regressionPlan || []).length < 8) {
    recommendations.push('Expand regression plan with module-specific edge cases (permissions + notifications).');
  }

  return {
    score,
    band,
    dimensionScores: scores,
    strengths,
    gaps,
    recommendations,
  };
}
