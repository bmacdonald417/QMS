import { generateAcceptanceCriteria } from './acceptance/acceptance-generator.js';
import { scoreImplementationReadiness } from './acceptance/readiness-scorer.js';
import { generateMigrationRiskSummary } from './acceptance/risk-summary-generator.js';
import { suggestFixtures } from './acceptance/fixture-suggester.js';
import { generateRegressionPlan } from './test-plan/regression-plan-generator.js';

/**
 * @param {Record<string, unknown>} payload
 */
export function extractImplementationReadinessFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const ir = /** @type {any} */ (payload).implementationReadiness;
  return ir && typeof ir === 'object' ? ir : null;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {Record<string, unknown>} implementationReadiness
 */
export function attachImplementationReadinessToPayload(payload, implementationReadiness) {
  return { ...payload, implementationReadiness };
}

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
export function buildReadinessContextFromPackage(pkg) {
  const request = pkg.agentRequest;
  const intelligence = pkg.intelligenceJson && typeof pkg.intelligenceJson === 'object' ? pkg.intelligenceJson : null;
  const payload = pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {};
  const schemaPlan = /** @type {any} */ (payload).sourceArtifacts?.schemaPlan ?? null;
  const workflowSpec = /** @type {any} */ (payload).sourceArtifacts?.workflowSpec ?? null;
  const implementationPlan = /** @type {any} */ (payload).sourceArtifacts?.implementationPlan ?? null;
  const tasks = (pkg.tasks || []).map((t) => ({
    title: t.title,
    description: t.description,
    taskType: t.taskType,
  }));

  return {
    packageType: pkg.packageType,
    request: {
      id: request.id,
      type: request.type,
      title: request.title,
      description: request.description,
      businessReason: request.businessReason,
      moduleName: request.moduleName,
      routePath: request.routePath,
      priority: request.priority,
      status: request.status,
    },
    intelligence,
    tasks,
    workflowDefinition: request.workflowDefinition ?? null,
    schemaPlan,
    workflowSpec,
    implementationPlan,
  };
}

/**
 * @param {ReturnType<typeof buildReadinessContextFromPackage>} ctx
 * @param {Record<string, unknown> | null} [prior]
 */
export function generateFullImplementationReadinessPayload(ctx, prior = null) {
  const acceptanceCriteria = generateAcceptanceCriteria(ctx);
  const migrationRiskSummary = generateMigrationRiskSummary(ctx);
  const regressionPlan = generateRegressionPlan(ctx, acceptanceCriteria);
  const readinessScore = scoreImplementationReadiness(ctx, acceptanceCriteria, regressionPlan, migrationRiskSummary);
  const moduleKey =
    (ctx.intelligence && (/** @type {any} */ (ctx.intelligence).effectiveModuleKey || /** @type {any} */ (ctx.intelligence).inferredModuleKey)) ||
    null;
  const fixtureSuggestions = suggestFixtures(moduleKey, ctx.packageType);

  const completionGuidance = [
    'Done means: approved scope implemented, automated tests added/updated where practical, and audit-friendly logging verified.',
    'Preserve: historical audit rows, immutable timestamps, and human authorization gates for privileged transitions.',
    'Test: permission matrix, workflow transitions, notifications (if any), and schema backfills on representative data.',
    'Avoid: silent destructive migrations, client-only authorization, and undocumented template divergences.',
  ];

  const unresolvedGaps = [...(readinessScore.gaps || [])];
  if (readinessScore.band === 'LOW' || readinessScore.band === 'MEDIUM') {
    unresolvedGaps.push('Readiness band is not READY; review recommendations before marking package READY.');
  }

  const priorAck = prior && typeof prior === 'object' ? /** @type {any} */ (prior).gapsAcknowledged : null;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    acceptanceCriteria,
    regressionPlan,
    readinessScore,
    migrationRiskSummary,
    fixtureSuggestions,
    completionGuidance,
    unresolvedGaps,
    gapsAcknowledged: priorAck ?? null,
  };
}

/**
 * @param {ReturnType<typeof buildReadinessContextFromPackage>} ctx
 * @param {Record<string, unknown> | null} prior
 */
export function generateAcceptanceOnlyPayload(ctx, prior) {
  const acceptanceCriteria = generateAcceptanceCriteria(ctx);
  const next = {
    ...(prior && typeof prior === 'object' ? prior : {}),
    version: 1,
    generatedAt: new Date().toISOString(),
    acceptanceCriteria,
    gapsAcknowledged: prior && /** @type {any} */ (prior).gapsAcknowledged ? /** @type {any} */ (prior).gapsAcknowledged : null,
  };
  return recomputeDerived(next, ctx);
}

/**
 * @param {ReturnType<typeof buildReadinessContextFromPackage>} ctx
 * @param {Record<string, unknown> | null} prior
 */
export function generateTestPlanOnlyPayload(ctx, prior) {
  const base = prior && typeof prior === 'object' ? prior : {};
  const acceptanceCriteria = Array.isArray(/** @type {any} */ (base).acceptanceCriteria) ? /** @type {any} */ (base).acceptanceCriteria : generateAcceptanceCriteria(ctx);
  const regressionPlan = generateRegressionPlan(ctx, acceptanceCriteria);
  const next = {
    ...base,
    version: 1,
    generatedAt: new Date().toISOString(),
    acceptanceCriteria,
    regressionPlan,
    gapsAcknowledged: /** @type {any} */ (base).gapsAcknowledged ?? null,
  };
  return recomputeDerived(next, ctx);
}

/**
 * @param {ReturnType<typeof buildReadinessContextFromPackage>} ctx
 * @param {Record<string, unknown> | null} prior
 */
export function generateReadinessOnlyPayload(ctx, prior) {
  const base = prior && typeof prior === 'object' ? prior : {};
  const acceptanceCriteria =
    Array.isArray(/** @type {any} */ (base).acceptanceCriteria) && /** @type {any} */ (base).acceptanceCriteria.length
      ? /** @type {any} */ (base).acceptanceCriteria
      : generateAcceptanceCriteria(ctx);
  const regressionPlan =
    Array.isArray(/** @type {any} */ (base).regressionPlan) && /** @type {any} */ (base).regressionPlan.length
      ? /** @type {any} */ (base).regressionPlan
      : generateRegressionPlan(ctx, acceptanceCriteria);
  const migrationRiskSummary =
    /** @type {any} */ (base).migrationRiskSummary !== undefined
      ? /** @type {any} */ (base).migrationRiskSummary
      : generateMigrationRiskSummary(ctx);
  const next = {
    ...base,
    version: 1,
    generatedAt: new Date().toISOString(),
    acceptanceCriteria,
    regressionPlan,
    migrationRiskSummary,
    gapsAcknowledged: /** @type {any} */ (base).gapsAcknowledged ?? null,
  };
  return recomputeDerived(next, ctx);
}

/**
 * @param {Record<string, unknown>} partial
 * @param {ReturnType<typeof buildReadinessContextFromPackage>} ctx
 */
function recomputeDerived(partial, ctx) {
  const acceptanceCriteria = Array.isArray(partial.acceptanceCriteria) ? partial.acceptanceCriteria : generateAcceptanceCriteria(ctx);
  const migrationRiskSummary =
    partial.migrationRiskSummary === undefined ? generateMigrationRiskSummary(ctx) : partial.migrationRiskSummary;
  const regressionPlan = Array.isArray(partial.regressionPlan)
    ? partial.regressionPlan
    : generateRegressionPlan(ctx, acceptanceCriteria);
  const readinessScore = scoreImplementationReadiness(ctx, acceptanceCriteria, regressionPlan, migrationRiskSummary);
  const moduleKey =
    (ctx.intelligence && (/** @type {any} */ (ctx.intelligence).effectiveModuleKey || /** @type {any} */ (ctx.intelligence).inferredModuleKey)) ||
    null;
  const fixtureSuggestions = Array.isArray(partial.fixtureSuggestions)
    ? partial.fixtureSuggestions
    : suggestFixtures(moduleKey, ctx.packageType);

  const completionGuidance = Array.isArray(partial.completionGuidance)
    ? partial.completionGuidance
    : [
        'Done means: approved scope implemented, automated tests added/updated where practical, and audit-friendly logging verified.',
        'Preserve: historical audit rows, immutable timestamps, and human authorization gates for privileged transitions.',
        'Test: permission matrix, workflow transitions, notifications (if any), and schema backfills on representative data.',
        'Avoid: silent destructive migrations, client-only authorization, and undocumented template divergences.',
      ];

  const unresolvedGaps = [...(readinessScore.gaps || [])];
  if (readinessScore.band === 'LOW' || readinessScore.band === 'MEDIUM') {
    unresolvedGaps.push('Readiness band is not READY; review recommendations before marking package READY.');
  }

  return {
    ...partial,
    acceptanceCriteria,
    regressionPlan,
    readinessScore,
    migrationRiskSummary,
    fixtureSuggestions,
    completionGuidance,
    unresolvedGaps,
  };
}
