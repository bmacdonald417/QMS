/**
 * @typedef {{ title: string, description: string, taskType: string, orderIndex: number, metadata?: Record<string, unknown> }} GeneratedTask
 */

import { getQmsModule } from './module-registry/index.js';
import { getWorkflowTemplate } from './workflow-templates/index.js';

/**
 * @param {{
 *   packageType: string;
 *   request: import('@prisma/client').AgentRequest & { workflowDefinition?: { outputType?: string } | null };
 *   effectiveModuleKey?: string | null;
 *   effectiveTemplateKey?: string | null;
 *   intelligence?: Record<string, unknown> | null;
 * }} params
 * @returns {GeneratedTask[]}
 */
export function generateExecutionTasks({
  packageType,
  request,
  effectiveModuleKey,
  effectiveTemplateKey,
  intelligence,
}) {
  /** @type {GeneratedTask[]} */
  const tasks = [];
  const mod = request.moduleName || 'Target module';
  const route = request.routePath || '(route TBD)';
  const moduleKey = effectiveModuleKey || null;
  const moduleDef = moduleKey ? getQmsModule(moduleKey) : null;
  const template = effectiveTemplateKey ? getWorkflowTemplate(effectiveTemplateKey) : null;

  const push = (orderIndex, taskType, title, description, metadata) => {
    tasks.push({
      orderIndex,
      taskType,
      title,
      description,
      metadata: { generatedBy: 'intelligence', ...metadata },
    });
  };

  const schemaImpact = packageType === 'SCHEMA_CHANGE' || packageType === 'MIXED';
  const uiImpact = packageType === 'UI_CHANGE' || packageType === 'MIXED';
  const wfImpact = packageType === 'WORKFLOW_BUILD' || packageType === 'MIXED';

  if (uiImpact) {
    push(10, 'FRONTEND', `Update UI for ${mod}`, `Review and implement UI changes for ${route}. Align with approved scope and governance notes.`, {
      routePath: request.routePath,
      moduleKey,
    });
    push(11, 'VALIDATION', 'Add / extend client and server validation', 'Ensure validation covers new fields, transitions, and error states.', {
      moduleKey,
    });
    push(12, 'TESTING', 'Regression tests for affected views', 'Add or update tests for critical flows impacted by the UI change.', { moduleKey });
  }

  if (wfImpact) {
    push(
      20,
      'BACKEND',
      'Implement workflow transitions and guards',
      'Add server-side checks for allowed transitions, roles, and audit logging hooks.',
      { moduleKey, templateKey: template?.templateKey }
    );
    push(21, 'DATABASE', 'Persist workflow state / history as designed', 'Create or extend tables for durable workflow tracking (non-destructive migrations preferred).', {
      moduleKey,
    });
    push(22, 'VALIDATION', 'Add Zod (or equivalent) validation for transitions', 'Validate payloads for each transition; reject invalid states early.', {
      moduleKey,
    });
    push(23, 'TESTING', 'Add coverage for workflow state changes', 'Unit/integration tests for transition matrix and permissions.', { moduleKey });
    push(24, 'DOCS', 'Update internal workflow documentation', 'Document states, transitions, and operational runbook notes.', {
      moduleKey,
      templateKey: template?.templateKey,
    });
  }

  if (schemaImpact) {
    push(30, 'DATABASE', 'Author additive migration and backfill plan', 'Prefer additive columns/indexes; document rollback strategy.', { moduleKey });
    push(31, 'BACKEND', 'Update persistence layer and queries', 'Ensure ORM/models reflect schema changes with typed accessors.', { moduleKey });
    push(32, 'TESTING', 'Migration safety checks / data integrity tests', 'Cover seed data, constraints, and performance-sensitive queries.', { moduleKey });
  }

  // Module-specific tasks (highest value)
  if (moduleKey === 'document-control') {
    push(40, 'BACKEND', 'Verify effective-date handling', 'Ensure effective dating rules cannot create two EFFECTIVE rows for same documentId.', { moduleKey });
    push(41, 'DATABASE', 'Verify revision history retention', 'Confirm document_history / revisions capture summary-of-change and authorship.', { moduleKey });
    push(42, 'VALIDATION', 'Verify approval signature support', 'Align signature meaning, hashes, and UI flows with ESign configuration.', { moduleKey });
    push(43, 'TESTING', 'Verify training assignment linkage', 'When document becomes EFFECTIVE, training assignment rules behave as expected.', { moduleKey });
  }

  if (moduleKey === 'training') {
    push(40, 'BACKEND', 'Verify audience targeting', 'Assignments respect role/site rules and active users only.', { moduleKey });
    push(41, 'BACKEND', 'Verify completion tracking', 'Completion timestamps and scores persist with audit-friendly updates.', { moduleKey });
    push(42, 'BACKEND', 'Verify overdue reminders', 'Overdue transitions/notifications do not create destructive side effects.', { moduleKey });
    push(43, 'VALIDATION', 'Verify retraining logic', 'Re-assign when governing document revises; avoid orphaned records.', { moduleKey });
  }

  if (moduleKey === 'capa') {
    push(40, 'BACKEND', 'Verify root cause capture', 'RCA fields are structured, retained, and immutable after closure where required.', { moduleKey });
    push(41, 'BACKEND', 'Verify action ownership', 'Tasks have owners, due dates, and cannot be silently reassigned without audit.', { moduleKey });
    push(42, 'TESTING', 'Verify effectiveness check', 'Waivers require justification; effectiveness evidence is queryable.', { moduleKey });
    push(43, 'VALIDATION', 'Verify closure gating', 'Cannot close without satisfying required signatures and task completion rules.', { moduleKey });
  }

  if (moduleKey === 'change-control') {
    push(40, 'DOCS', 'Verify impact assessment completeness', 'Linked documents/CAPA references captured with traceability.', { moduleKey });
    push(41, 'BACKEND', 'Verify approval chain', 'Segregation between initiator/approver enforced server-side.', { moduleKey });
    push(42, 'TESTING', 'Verify implementation evidence', 'Implementation tasks produce durable evidence artifacts.', { moduleKey });
  }

  if (moduleKey === 'supplier-quality') {
    push(40, 'VALIDATION', 'Verify qualification criteria', 'Decision records include criteria checklist and approver identity.', { moduleKey });
    push(41, 'TESTING', 'Verify certificate/expiry handling', 'If tracked, ensure non-destructive status transitions.', { moduleKey });
  }

  if (moduleKey === 'audit-management') {
    push(40, 'BACKEND', 'Verify finding severity rules', 'Major/critical findings require CAPA linkage where policy demands.', { moduleKey });
    push(41, 'TESTING', 'Verify response due enforcement', 'Due dates and escalations are auditable.', { moduleKey });
  }

  if (moduleKey === 'deviation') {
    push(40, 'BACKEND', 'Verify product impact assessment', 'Disposition rationale and lot/batch trace captured.', { moduleKey });
    push(41, 'TESTING', 'Verify investigation completeness', 'Cannot approve closure without required fields.', { moduleKey });
  }

  if (moduleKey === 'risk-management') {
    push(40, 'BACKEND', 'Verify risk scoring consistency', 'Scores and residual risk acceptance are versioned and attributable.', { moduleKey });
    push(41, 'DOCS', 'Verify monitoring plan', 'Accepted risks include monitoring cadence and owners.', { moduleKey });
  }

  if (template?.templateKey === 'capa-lifecycle' && moduleKey !== 'capa') {
    push(90, 'DOCS', 'Template mismatch review', `Template ${template.templateKey} selected; confirm module mapping is intentional.`, {
      templateKey: template.templateKey,
    });
  }

  if (intelligence?.engineeringNotes && Array.isArray(intelligence.engineeringNotes) && intelligence.engineeringNotes.length) {
    const note0 = String(intelligence.engineeringNotes[0] || '').slice(0, 500);
    push(95, 'DOCS', 'Review intelligence engineering notes', note0 || 'See package intelligence JSON.', { moduleKey });
  }

  tasks.sort((a, b) => a.orderIndex - b.orderIndex);
  return tasks;
}
