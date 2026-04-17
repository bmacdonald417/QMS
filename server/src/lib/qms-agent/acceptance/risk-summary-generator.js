/**
 * @param {{
 *   packageType: string;
 *   intelligence: Record<string, unknown> | null;
 *   schemaPlan: Record<string, unknown> | null | undefined;
 *   workflowDefinition: Record<string, unknown> | null | undefined;
 * }} ctx
 */
export function generateMigrationRiskSummary(ctx) {
  const { packageType, intelligence, schemaPlan, workflowDefinition } = ctx;
  const intel = intelligence && typeof intelligence === 'object' ? intelligence : null;
  const affectedSchemaAreas = Array.isArray((/** @type {any} */ (intel))?.affectedSchemaAreas)
    ? (/** @type {any} */ (intel)).affectedSchemaAreas
    : [];
  const affectedEntities = Array.isArray((/** @type {any} */ (intel))?.affectedEntities)
    ? (/** @type {any} */ (intel)).affectedEntities)
    : [];

  const hasSchema =
    packageType === 'SCHEMA_CHANGE' ||
    packageType === 'MIXED' ||
    Boolean(schemaPlan && typeof schemaPlan === 'object' && Object.keys(schemaPlan).length > 0);

  if (!hasSchema) {
    return null;
  }

  const planTables = [];
  if (schemaPlan && typeof schemaPlan === 'object') {
    const hinted = /** @type {any} */ (schemaPlan).tables || /** @type {any} */ (schemaPlan).models;
    if (Array.isArray(hinted)) {
      for (const t of hinted.slice(0, 24)) {
        if (typeof t === 'string') planTables.push(t);
        else if (t && typeof t === 'object' && 'name' in t) planTables.push(String(/** @type {any} */ (t).name));
      }
    }
  }

  const impactedTables = [...new Set([...affectedEntities.map(String), ...affectedSchemaAreas.map(String), ...planTables])].slice(
    0,
    24
  );

  /** @type {string[]} */
  const backwardsCompatibility = [
    'Prefer additive columns and nullable rollout phases before tightening NOT NULL constraints.',
    'Avoid renaming columns without a compatibility view or dual-write period unless explicitly authorized.',
  ];

  /** @type {string[]} */
  const nullabilityRisks = [
    'Tightening nullability can fail on existing rows; plan staged backfills and validation queries.',
    'New required foreign keys may orphan historical rows; assess retention and archival paths.',
  ];

  /** @type {string[]} */
  const indexPerformance = [
    'New filters/sorts may require composite indexes; verify explain plans for list endpoints.',
    'Large backfills can lock tables; batch updates and consider off-hours maintenance windows.',
  ];

  /** @type {string[]} */
  const seedBackfill = [
    'Identify minimal seed rows required for dev/stage parity; avoid auto-seeding production business data from generators.',
    'Document any required manual backfill scripts and verification queries.',
  ];

  /** @type {string[]} */
  const auditRetention = [
    'Do not rewrite immutable audit history; append-only patterns preserve traceability.',
    'If migrating historical records, preserve original timestamps in dedicated columns where feasible.',
  ];

  /** @type {string[]} */
  const trainingDocumentRisks = [
    'Schema changes to document/training join tables can break effective-date logic; verify revision coupling.',
    'If workflow states rename, ensure training assignments still map to correct operational states.',
  ];

  /** @type {string[]} */
  const rolloutCautions = [
    'Ship behind feature flags or staged rollout if workflow and schema change together.',
    'Coordinate cache invalidation and API versioning if mobile/integrations consume the same endpoints.',
  ];

  /** @type {string[]} */
  const destructiveWarnings = [
    'DROP/TRUNCATE/CASCADE deletes are high risk; require explicit sign-off, backups, and restore drill.',
    'Data migrations that reinterpret meaning (e.g., status remaps) must include reconciliation reports.',
  ];

  const wfNote =
    workflowDefinition && Array.isArray(workflowDefinition.states)
      ? `Workflow snapshot includes ${workflowDefinition.states.length} states; align schema with transition persistence.`
      : 'No workflow snapshot attached; schema risk review should explicitly confirm lifecycle persistence tables.';

  return {
    summary:
      'Schema-impacting package: treat migrations as production-critical. Default to additive changes, staged nullability, and measurable backfills.',
    impactedTables,
    backwardsCompatibility,
    nullabilityRisks,
    indexPerformance,
    seedBackfill,
    auditRetention,
    trainingDocumentRisks,
    rolloutCautions,
    destructiveWarnings,
    workflowNotes: [wfNote],
  };
}
