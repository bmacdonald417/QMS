import { ACCEPTANCE_CATEGORIES, CATEGORY_DEFAULTS, makeCriterionId, textStrength } from './acceptance-rules.js';

/**
 * @param {{
 *   packageType: string;
 *   request: Record<string, unknown>;
 *   intelligence: Record<string, unknown> | null;
 *   tasks: Array<{ title: string; description: string; taskType: string }>;
 *   workflowDefinition: Record<string, unknown> | null | undefined;
 *   schemaPlan: Record<string, unknown> | null | undefined;
 *   workflowSpec: Record<string, unknown> | null | undefined;
 * }} ctx
 */
export function generateAcceptanceCriteria(ctx) {
  const { packageType, request, intelligence, tasks, workflowDefinition, schemaPlan, workflowSpec: _workflowSpec } =
    ctx;
  void _workflowSpec;
  const mod = intelligence && typeof intelligence === 'object' ? (/** @type {any} */ (intelligence).module) : null;
  const template = intelligence && typeof intelligence === 'object' ? (/** @type {any} */ (intelligence).suggestedTemplate) : null;
  const moduleKey = mod?.moduleKey ?? 'unknown';
  const effModule = (/** @type {any} */ (intelligence))?.effectiveModuleKey ?? (/** @type {any} */ (intelligence))?.inferredModuleKey;
  const effTemplate = (/** @type {any} */ (intelligence))?.effectiveTemplateKey ?? (/** @type {any} */ (intelligence))?.suggestedTemplateKey;

  /** @type {Array<Record<string, unknown>>} */
  const raw = [];

  const push = (category, description, rationale, priority, verificationType, source) => {
    if (!ACCEPTANCE_CATEGORIES.includes(category)) return;
    const d = CATEGORY_DEFAULTS[category] || { verificationType: 'MANUAL', defaultPriority: 'MEDIUM' };
    raw.push({
      category,
      description,
      rationale,
      priority: priority || d.defaultPriority,
      verificationType: verificationType || d.verificationType,
      source,
    });
  };

  // Functional
  push(
    'functional',
    `Implementation matches approved scope for request type ${String(request.type)} and title "${String(request.title || '').slice(0, 120)}".`,
    'Governed execution packages must not expand scope beyond APPROVED_FOR_IMPLEMENTATION intake.',
    'HIGH',
    'MANUAL',
    'MODULE'
  );
  if (request.routePath) {
    push(
      'functional',
      `Route ${String(request.routePath)} loads correct module shell, data contracts, and error states without silent failures.`,
      'UI routing is the primary user-visible contract for many QMS changes.',
      'HIGH',
      'UI_REVIEW',
      'MODULE'
    );
  }

  // UI/UX
  push(
    'ui_ux',
    'Loading, empty, error, and permission-denied states are explicit; destructive actions require confirmation aligned with existing patterns.',
    'QMS operators need predictable UX under partial failures and authorization denials.',
    'MEDIUM',
    'UI_REVIEW',
    'MODULE'
  );

  // Permissions / security
  push(
    'permissions_security',
    'All privileged transitions are enforced server-side; client-only checks are insufficient.',
    'QMS governance expects durable authorization and tamper-resistant transitions.',
    'HIGH',
    'API_REVIEW',
    'MODULE'
  );
  if (Array.isArray(mod?.commonRoles) && mod.commonRoles.length) {
    push(
      'permissions_security',
      `Role-sensitive flows respect at least: ${mod.commonRoles.slice(0, 8).join(', ')}.`,
      'Module registry encodes typical segregation patterns for this domain.',
      'HIGH',
      'API_REVIEW',
      'MODULE'
    );
  }

  // Auditability
  push(
    'auditability',
    'Material state changes emit attributable audit records (who/when/what) consistent with existing audit helpers.',
    'Auditability is a non-negotiable control for regulated QMS operations.',
    'HIGH',
    'DB_REVIEW',
    'MODULE'
  );
  if (Array.isArray(mod?.commonAuditRequirements) && mod.commonAuditRequirements.length) {
    for (const a of mod.commonAuditRequirements.slice(0, 4)) {
      push('auditability', String(a), 'Module-specific audit expectations from registry.', 'HIGH', 'MANUAL', 'MODULE');
    }
  }

  // Workflow behavior
  if (workflowDefinition && typeof workflowDefinition === 'object') {
    const states = /** @type {any[]} */ (workflowDefinition.states) || [];
    const transitions = /** @type {any[]} */ (workflowDefinition.transitions) || [];
    push(
      'workflow_behavior',
      `Workflow respects modeled states (${states.length}) and transitions (${transitions.length}); illegal transitions are rejected with safe errors.`,
      'Workflow definitions are the contract for lifecycle correctness.',
      'HIGH',
      'MANUAL',
      'WORKFLOW'
    );
  } else if (packageType === 'WORKFLOW_BUILD' || packageType === 'MIXED') {
    push(
      'workflow_behavior',
      'Workflow behavior is documented and tested even when no WorkflowDefinition snapshot is attached (verify against approved narrative).',
      'Packaging may occur without a persisted definition row; human verification closes the gap.',
      'MEDIUM',
      'MANUAL',
      'WORKFLOW'
    );
  }
  if (template?.templateKey) {
    push(
      'workflow_behavior',
      `Where code diverges from template "${String(template.templateName || effTemplate)}", divergence is documented with rationale and risk notes.`,
      'Templates are advisory baselines; silent divergence creates compliance drift.',
      'MEDIUM',
      'MANUAL',
      'TEMPLATE'
    );
  }

  // Notifications
  if (Array.isArray(mod?.commonNotificationPatterns) && mod.commonNotificationPatterns.length) {
    for (const n of mod.commonNotificationPatterns.slice(0, 3)) {
      push('notifications', String(n), 'Module notification expectations.', 'MEDIUM', 'MANUAL', 'MODULE');
    }
  } else {
    push(
      'notifications',
      'Notification triggers (if any) are idempotent, attributable, and do not leak sensitive payloads to the wrong audiences.',
      'Notifications frequently carry compliance-sensitive metadata.',
      'MEDIUM',
      'MANUAL',
      'MODULE'
    );
  }

  // Training linkage
  if (Array.isArray(mod?.commonTrainingLinkageRules) && mod.commonTrainingLinkageRules.length) {
    for (const r of mod.commonTrainingLinkageRules.slice(0, 3)) {
      push('training_linkage', String(r), 'Training linkage is a common audit finding area.', 'MEDIUM', 'MANUAL', 'MODULE');
    }
  } else {
    push(
      'training_linkage',
      'If operational behavior changes affect competency/read-and-understood obligations, training impacts are identified and tracked.',
      'Training traceability is a recurring QMS integration point.',
      'LOW',
      'MANUAL',
      'MODULE'
    );
  }

  // Schema / data integrity
  const hasSchemaSignal =
    packageType === 'SCHEMA_CHANGE' ||
    packageType === 'MIXED' ||
    Boolean(schemaPlan && typeof schemaPlan === 'object' && Object.keys(schemaPlan).length > 0);
  if (hasSchemaSignal) {
    push(
      'schema_data_integrity',
      'Schema changes are additive by default; destructive operations require explicit authorization, rollback notes, and data preservation plan.',
      'Non-destructive schema planning is a governance default for this pipeline.',
      'HIGH',
      'DB_REVIEW',
      'SCHEMA'
    );
    push(
      'schema_data_integrity',
      'Migrations preserve historical auditability (no silent rewrite of immutable history fields).',
      'Schema work frequently intersects audit retention expectations.',
      'HIGH',
      'DB_REVIEW',
      'SCHEMA'
    );
  } else {
    push(
      'schema_data_integrity',
      'No schema mutations are introduced incidentally (verify Prisma models and API DTOs remain aligned).',
      'Even UI-only requests can accidentally widen persistence contracts.',
      'MEDIUM',
      'DB_REVIEW',
      'SCHEMA'
    );
  }

  // Reporting / traceability
  push(
    'reporting_traceability',
    'List/search/report surfaces remain consistent with existing filters, sorting, and export behaviors where applicable.',
    'Operators rely on traceable lists for inspections and internal audits.',
    'MEDIUM',
    'MANUAL',
    'MODULE'
  );

  // Regression protection
  push(
    'regression_protection',
    'Automated tests cover critical paths touched by this package; manual QA scenarios cover permission and workflow edge cases.',
    'Regression protection reduces rework and audit findings after release.',
    'HIGH',
    'AUTOMATED',
    'MODULE'
  );

  // Task-linked criteria
  for (let i = 0; i < (tasks || []).length; i++) {
    const t = tasks[i];
    push(
      'functional',
      `Execution task completed to standard: ${t.title}`,
      `Packaged task: ${(t.description || '').slice(0, 200)}`,
      t.taskType === 'DATABASE' || t.taskType === 'BACKEND' ? 'HIGH' : 'MEDIUM',
      t.taskType === 'TESTING' ? 'AUTOMATED' : 'MANUAL',
      'TASK'
    );
  }

  // De-duplicate by description (simple)
  const seen = new Set();
  const deduped = [];
  for (const r of raw) {
    const k = `${r.category}|${r.description}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }

  return deduped.map((r, idx) => ({
    id: makeCriterionId(r.category, idx),
    category: r.category,
    description: r.description,
    rationale: r.rationale,
    priority: r.priority,
    verificationType: r.verificationType,
    source: r.source,
    moduleKey,
    effectiveModuleKey: effModule ?? null,
    effectiveTemplateKey: effTemplate ?? null,
    scopeTextStrength: textStrength(String(request.description || '')),
  }));
}
