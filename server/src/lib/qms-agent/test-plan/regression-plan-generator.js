/**
 * @param {{
 *   packageType: string;
 *   request: Record<string, unknown>;
 *   intelligence: Record<string, unknown> | null;
 *   workflowDefinition: Record<string, unknown> | null | undefined;
 *   schemaPlan: Record<string, unknown> | null | undefined;
 * }} ctx
 * @param {Array<{ id: string; category: string }>} acceptanceCriteria
 */
export function generateRegressionPlan(ctx, acceptanceCriteria) {
  const { packageType, request, intelligence, workflowDefinition, schemaPlan } = ctx;
  const mod = intelligence && typeof intelligence === 'object' ? (/** @type {any} */ (intelligence).module) : null;
  const acIds = (acceptanceCriteria || []).map((c) => c.id).filter(Boolean);

  const pickAc = (n = 3) => acIds.slice(0, n);

  /** @type {Array<Record<string, unknown>>} */
  const items = [];
  let idx = 0;
  const add = (area, title, type, description, expectedOutcome, riskLevel, related) => {
    idx += 1;
    items.push({
      id: `rt-${area.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${idx}`,
      title,
      type,
      area,
      description,
      expectedOutcome,
      riskLevel,
      relatedAcceptanceCriteriaIds: related,
    });
  };

  add(
    'frontend',
    'Smoke: primary route renders without console errors',
    'E2E',
    `Load ${String(request.routePath || 'primary affected routes')} as authenticated users with representative roles.`,
    'Page renders; critical widgets visible; no unhandled promise rejections in console for happy path.',
    'MEDIUM',
    pickAc(2)
  );

  add(
    'frontend',
    'Regression: navigation + deep links',
    'MANUAL',
    'Verify sidebar/nav labels, breadcrumbs, and direct URL entry for affected pages.',
    'Navigation remains coherent; unauthorized users receive expected denial UX.',
    'LOW',
    pickAc(1)
  );

  add(
    'backend_api',
    'API contract tests for changed endpoints',
    'INTEGRATION',
    'Exercise new/changed Express routes with auth headers; assert status codes, error shapes, and side effects on audit logs.',
    'Responses match documented contracts; failures are structured; no silent 500s for valid input.',
    'HIGH',
    pickAc(3)
  );

  add(
    'database_data_integrity',
    'DB validation: constraints and referential integrity',
    'DB_VALIDATION',
    'Validate foreign keys, unique constraints, and enum fields for new/changed writes; confirm no orphan rows after lifecycle transitions.',
    'Database remains consistent; migrations apply cleanly on a fresh clone.',
    packageType === 'SCHEMA_CHANGE' || packageType === 'MIXED' ? 'HIGH' : 'MEDIUM',
    pickAc(3)
  );

  if (workflowDefinition && Array.isArray(workflowDefinition.transitions)) {
    add(
      'workflow_transition',
      'Transition matrix: allowed vs forbidden moves',
      'INTEGRATION',
      `For each modeled transition (${workflowDefinition.transitions.length}), assert role gates and invalid transition handling.`,
      'Illegal transitions rejected; legal transitions persist correct state and audit trail.',
      'HIGH',
      pickAc(4)
    );
  }

  add(
    'role_permission',
    'Role matrix: least privilege spot checks',
    'MANUAL',
    'For each sensitive action, verify at least two roles: authorized succeeds; unauthorized is denied server-side.',
    'No privilege escalation via crafted requests or UI-only bypass.',
    'HIGH',
    pickAc(4)
  );

  add(
    'notification',
    'Notification idempotency + audience boundaries',
    'MANUAL',
    'Trigger events twice; verify deduplication or safe repeats; verify recipients match policy.',
    'No duplicate spam; sensitive content not sent to unintended recipients.',
    'MEDIUM',
    pickAc(2)
  );

  add(
    'audit_trail',
    'Audit trail completeness for material events',
    'DB_VALIDATION',
    'Verify audit rows include actor, timestamps, entity identifiers, and before/after payloads where required.',
    'Auditors can reconstruct the story without database forensics.',
    'HIGH',
    pickAc(4)
  );

  add(
    'document_training_linkage',
    'Training / document linkage checks (if module touches controlled docs or training)',
    'MANUAL',
    mod?.moduleKey === 'document-control' || mod?.moduleKey === 'training'
      ? 'Exercise draft → review → approval/effective transitions; verify training assignment hooks if applicable.'
      : 'If change impacts controlled documents or training obligations, verify linkage fields and downstream lists.',
    'No broken links; downstream training assignments remain coherent.',
    mod?.moduleKey === 'document-control' || mod?.moduleKey === 'training' ? 'HIGH' : 'MEDIUM',
    pickAc(2)
  );

  add(
    'frontend',
    'Suggested automated unit tests for pure logic',
    'UNIT',
    'Extract pure functions (validators, transition guards, formatting) and add unit tests with edge cases.',
    'High-value logic covered with fast tests; edge cases documented.',
    'LOW',
    pickAc(1)
  );

  if (schemaPlan && typeof schemaPlan === 'object' && Object.keys(schemaPlan).length > 1) {
    add(
      'database_data_integrity',
      'Migration dry-run on staging dataset',
      'MANUAL',
      'Apply schema plan against representative anonymized data; measure query plans for hot paths.',
      'No unexpected locks; performance within acceptable bounds; rollback path documented.',
      'HIGH',
      pickAc(4)
    );
  }

  return items;
}
