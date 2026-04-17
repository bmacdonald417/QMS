import { prisma } from '../../db.js';
import { createAuditLog, getAuditContext } from '../../audit.js';
import { extractImplementationReadinessFromPayload } from './implementation-readiness-service.js';

const ENTITY = 'CursorHandoff';

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
function getPackageIntelligence(pkg) {
  const j = pkg.intelligenceJson;
  return j && typeof j === 'object' ? j : null;
}

/**
 * @param {string | null | undefined} moduleKey
 */
function moduleAntiPatterns(moduleKey) {
  const base = [
    'Bypassing server-side authorization checks for privileged transitions.',
    'Introducing silent destructive schema operations without migration review.',
  ];
  if (moduleKey === 'document-control') {
    base.push('Mutating effective document content in-place without a new version row and history entry.');
  }
  if (moduleKey === 'training') {
    base.push('Deleting completion evidence or rewriting historical completion timestamps.');
  }
  if (moduleKey === 'capa') {
    base.push('Closing CAPA without effectiveness evidence (unless governed waiver is implemented).');
  }
  if (moduleKey === 'change-control') {
    base.push('Approving and implementing changes without durable evidence links.');
  }
  return base;
}

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
export function buildRepoContext(pkg) {
  const req = pkg.agentRequest;
  const intel = getPackageIntelligence(pkg);
  const moduleKey = intel?.effectiveModuleKey || intel?.inferredModuleKey || pkg.moduleKeyOverride || pkg.inferredModuleKey;
  const templateKey = intel?.effectiveTemplateKey || intel?.suggestedTemplateKey || pkg.templateKeyOverride || pkg.suggestedTemplateKey;
  return {
    stack: 'Vite/React frontend + Express/Prisma backend (MacTech QMS)',
    primaryServerPath: 'server/src',
    primaryClientPath: 'src',
    module: req.moduleName ?? null,
    routePath: req.routePath ?? null,
    inferredModuleKey: moduleKey ?? null,
    suggestedWorkflowTemplateKey: templateKey ?? null,
    notes:
      'This handoff is a read-only engineering artifact. It does not execute code or apply database changes by itself.',
  };
}

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
export function buildFileTargets(pkg) {
  const req = pkg.agentRequest;
  const intel = getPackageIntelligence(pkg);
  /** @type {string[]} */
  const targets = [];
  if (req.routePath) targets.push(`Route context: ${req.routePath}`);
  if (req.moduleName) targets.push(`Business module: ${req.moduleName}`);
  const mod = intel?.module;
  if (mod?.commonUIAreas?.length) {
    for (const p of mod.commonUIAreas) targets.push(`Likely UI surface: ${p}`);
  }
  if (Array.isArray(intel?.likelyBackendTouchpoints)) {
    for (const p of intel.likelyBackendTouchpoints) targets.push(`Likely backend touchpoint: ${p}`);
  }
  targets.push('server/src/agent/agentService.js');
  targets.push('server/src/agent/agentRoutes.js');
  targets.push('server/prisma/schema.prisma');
  targets.push('src/pages/system/SystemQmsAgent.tsx');
  targets.push('src/App.tsx');
  targets.push('server/src/lib/qms-agent/module-registry/modules-data.js');
  targets.push('server/src/lib/qms-agent/workflow-templates/templates-data.js');
  return targets;
}

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
export function buildSchemaContext(pkg) {
  const payload = pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {};
  const schemaPlan = payload.sourceArtifacts?.schemaPlan ?? null;
  const intel = getPackageIntelligence(pkg);
  return {
    schemaPlan,
    moduleSchemaPatterns: intel?.module?.commonSchemaPatterns ?? [],
    affectedSchemaAreas: intel?.affectedSchemaAreas ?? [],
    nonDestructiveDefault: true,
    reminder: 'Prefer additive Prisma migrations; avoid destructive changes unless explicitly authorized.',
  };
}

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
export function buildWorkflowContext(pkg) {
  const def = pkg.agentRequest.workflowDefinition;
  const payload = pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {};
  const intel = getPackageIntelligence(pkg);
  return {
    workflowDefinition: def ?? null,
    workflowSpec: payload.sourceArtifacts?.workflowSpec ?? null,
    suggestedTemplate: intel?.suggestedTemplate ?? null,
    inferredModuleKey: intel?.inferredModuleKey ?? pkg.inferredModuleKey ?? null,
    suggestedTemplateKey: intel?.suggestedTemplateKey ?? pkg.suggestedTemplateKey ?? null,
  };
}

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
export function buildCursorEngineeringBrief(pkg) {
  const req = pkg.agentRequest;
  const payload = pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {};
  const intel = getPackageIntelligence(pkg);
  const moduleKey = intel?.effectiveModuleKey || intel?.inferredModuleKey || null;
  const ir = extractImplementationReadinessFromPayload(payload);
  const lines = [];
  lines.push(`# Engineering brief — ${pkg.title}`);
  lines.push('');
  lines.push(`## QMS module context`);
  if (intel?.module?.displayName) {
    lines.push(`- Inferred / effective module: **${intel.module.displayName}** (${intel.module.moduleKey})`);
  } else {
    lines.push('- Module context: not confidently inferred; treat as cross-cutting until confirmed.');
  }
  if (intel?.suggestedTemplate?.templateName) {
    lines.push(`- Suggested workflow template: **${intel.suggestedTemplate.templateName}** (${intel.suggestedTemplate.templateKey})`);
  }
  if (Array.isArray(intel?.affectedEntities) && intel.affectedEntities.length) {
    lines.push(`- Key entities: ${intel.affectedEntities.slice(0, 12).join(', ')}`);
  }
  if (Array.isArray(intel?.engineeringNotes) && intel.engineeringNotes.length) {
    lines.push('');
    lines.push(`## Module-specific engineering notes`);
    for (const n of intel.engineeringNotes) lines.push(`- ${n}`);
  }
  lines.push('');
  lines.push(`## What to build`);
  lines.push(req.description || '(see payload JSON)');
  lines.push('');
  lines.push(`## Why it matters`);
  lines.push(req.businessReason || '(see request record)');
  lines.push('');
  lines.push(`## Approved scope`);
  lines.push(`- Request status: ${req.status}`);
  lines.push(`- Package status: ${pkg.status} / type: ${pkg.packageType}`);
  if (Array.isArray(payload.approvedScope)) {
    for (const s of payload.approvedScope) lines.push(`- ${s}`);
  }
  lines.push('');
  lines.push(`## Constraints`);
  if (Array.isArray(payload.constraints)) {
    for (const c of payload.constraints) lines.push(`- ${c}`);
  }
  if (intel?.module?.commonAuditRequirements?.length) {
    lines.push('- Auditability: ensure immutable history and attributable transitions for this module.');
  }
  lines.push('');
  lines.push(`## Risks`);
  if (Array.isArray(payload.risks)) {
    for (const r of payload.risks) lines.push(`- ${r}`);
  }
  if (Array.isArray(intel?.moduleSpecificRisks)) {
    for (const r of intel.moduleSpecificRisks) lines.push(`- (module) ${r}`);
  }
  lines.push('');
  lines.push(`## Acceptance criteria (module-aware)`);
  if (Array.isArray(intel?.acceptanceCriteria) && intel.acceptanceCriteria.length) {
    for (const a of intel.acceptanceCriteria) lines.push(`- ${a}`);
  } else {
    lines.push('- Implement approved scope with tests and audit-friendly logging.');
  }
  if (ir && Array.isArray(ir.acceptanceCriteria) && ir.acceptanceCriteria.length) {
    lines.push('');
    lines.push(`## Structured acceptance criteria (generated)`);
    for (const c of ir.acceptanceCriteria.slice(0, 40)) {
      const crit = /** @type {any} */ (c);
      lines.push(
        `- **[${crit.id}]** (${crit.category} / ${crit.priority}): ${crit.description} — verify: ${crit.verificationType}`
      );
    }
  }
  if (ir?.readinessScore) {
    const rs = /** @type {any} */ (ir.readinessScore);
    lines.push('');
    lines.push(`## Implementation readiness`);
    lines.push(`- Score: **${rs.score}** (${rs.band})`);
    if (Array.isArray(rs.gaps) && rs.gaps.length) {
      lines.push('- Gaps:');
      for (const g of rs.gaps.slice(0, 12)) lines.push(`  - ${g}`);
    }
    if (Array.isArray(rs.recommendations) && rs.recommendations.length) {
      lines.push('- Recommendations:');
      for (const r of rs.recommendations.slice(0, 12)) lines.push(`  - ${r}`);
    }
  }
  if (ir && Array.isArray(ir.regressionPlan) && ir.regressionPlan.length) {
    lines.push('');
    lines.push(`## Recommended tests (high level)`);
    for (const t of ir.regressionPlan.slice(0, 16)) {
      const tt = /** @type {any} */ (t);
      lines.push(`- **${tt.title}** (${tt.type} / ${tt.riskLevel}): ${tt.description}`);
    }
  }
  if (ir?.migrationRiskSummary) {
    const m = /** @type {any} */ (ir.migrationRiskSummary);
    lines.push('');
    lines.push(`## Migration / schema cautions`);
    lines.push(`- ${m.summary}`);
    if (Array.isArray(m.destructiveWarnings)) {
      for (const w of m.destructiveWarnings) lines.push(`- ⚠ ${w}`);
    }
    if (Array.isArray(m.rolloutCautions)) {
      for (const w of m.rolloutCautions.slice(0, 6)) lines.push(`- Rollout: ${w}`);
    }
  }
  if (ir && Array.isArray(ir.fixtureSuggestions) && ir.fixtureSuggestions.length) {
    lines.push('');
    lines.push(`## Fixture / seed suggestions (do not auto-apply)`);
    for (const f of ir.fixtureSuggestions.slice(0, 8)) {
      const fx = /** @type {any} */ (f);
      lines.push(`- **${fx.label}** (${fx.module}): ${fx.purpose}`);
    }
  }
  lines.push('');
  lines.push(`## Anti-pattern warnings`);
  for (const w of moduleAntiPatterns(moduleKey)) lines.push(`- ${w}`);
  lines.push('');
  lines.push(`## Deliverables`);
  lines.push('- Implement approved scope with tests and audit-friendly logging.');
  lines.push('- Keep changes additive and typed; avoid uncontrolled destructive schema operations.');
  lines.push('- Update documentation where workflow or operational behavior changes.');
  return lines.join('\n');
}

/**
 * @param {NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>} pkg
 */
export function buildCursorHandoffPrompt(pkg) {
  const brief = buildCursorEngineeringBrief(pkg);
  const intel = getPackageIntelligence(pkg);
  const payload = pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {};
  const ir = extractImplementationReadinessFromPayload(payload);
  const deliverables = [
    'Working implementation aligned to approved scope',
    'Automated tests where practical',
    'Audit/event logging consistent with QMS expectations',
    'Migration scripts that are additive by default',
  ];
  if (Array.isArray(intel?.acceptanceCriteria)) {
    for (const a of intel.acceptanceCriteria.slice(0, 6)) deliverables.push(a);
  }
  if (ir && Array.isArray(ir.completionGuidance)) {
    for (const g of ir.completionGuidance.slice(0, 8)) deliverables.push(String(g));
  }
  const warnings = [
    'Do not run autonomous agents against production from this payload.',
    'Do not make uncontrolled destructive changes.',
    'Prefer additive, typed, production-safe updates.',
    'Treat this prompt as governance-aware guidance, not executable code.',
  ];
  for (const w of moduleAntiPatterns(intel?.effectiveModuleKey || intel?.inferredModuleKey)) warnings.push(w);

  const prompt = [
    'You are assisting with a governed QMS (quality management system) change.',
    '',
    brief,
    '',
    '## What "done" looks like for this package',
    '- Satisfy the approved request scope and the structured acceptance criteria in the engineering brief (where present).',
    '- Preserve auditability: attributable transitions, durable history, and server-side authorization for privileged actions.',
    '- Execute the recommended tests (automated + manual) for workflow, permissions, notifications, and schema/data integrity as applicable.',
    '- Treat migration cautions seriously: prefer additive Prisma changes; document unavoidable destructive steps explicitly.',
    ir?.gapsAcknowledged
      ? '- Note: an admin acknowledged known readiness gaps; still do not bypass safety or governance controls.'
      : '- If readiness gaps are listed, resolve or explicitly document mitigations before claiming completion.',
    '',
    '## Module-aware constraints',
    '- Preserve audit trails and human authorization gates; never “shortcut” production controls from the client alone.',
    '- Align lifecycle states, roles, and notifications with the module expectations described above.',
    '- If the suggested workflow template differs from existing code, document the delta explicitly in PR notes.',
    '',
    '## Cursor execution rules',
    '- Follow repository patterns (Express + Prisma server, Vite + React client).',
    '- Do not introduce silent data loss, broad deletes, or unreviewed schema destruction.',
    '- Ask for clarification if scope conflicts with safety or audit requirements.',
    '',
    '## Expected deliverables',
    ...deliverables.map((d) => `- ${d}`),
    '',
    '## Warnings',
    ...warnings.map((w) => `- ${w}`),
    '',
    '## Likely files to inspect',
    ...buildFileTargets(pkg).map((f) => `- ${f}`),
  ].join('\n');

  return { prompt, deliverables, warnings };
}

/**
 * @param {{ pkg: NonNullable<Awaited<ReturnType<import('./execution-package-service.js')['getExecutionPackageById']>>>; actorUserId: string; req: import('express').Request; advanceToSentToDev?: boolean }} params
 */
export async function createCursorHandoffForPackage({ pkg, actorUserId, req, advanceToSentToDev = true }) {
  if (pkg.status !== 'READY') {
    const err = new Error('Package must be READY before generating a Cursor handoff');
    err.code = 'PACKAGE_NOT_READY';
    throw err;
  }

  const repoContext = buildRepoContext(pkg);
  const fileTargets = buildFileTargets(pkg);
  const schemaContext = buildSchemaContext(pkg);
  const workflowContext = buildWorkflowContext(pkg);
  const { prompt, deliverables, warnings } = buildCursorHandoffPrompt(pkg);

  const summary = `Cursor handoff for execution package ${pkg.id} (request ${pkg.agentRequestId})`;

  const irPayload = extractImplementationReadinessFromPayload(
    pkg.payloadJson && typeof pkg.payloadJson === 'object' ? pkg.payloadJson : {}
  );

  const exportPayload = {
    summary,
    prompt,
    repoContext,
    fileTargets,
    schemaContext,
    workflowContext,
    deliverables,
    warnings,
    intelligence: getPackageIntelligence(pkg) ?? null,
    acceptanceCriteria: getPackageIntelligence(pkg)?.acceptanceCriteria ?? [],
    implementationReadiness: irPayload,
    readinessScoreSummary: irPayload?.readinessScore ?? null,
    unresolvedGaps: irPayload?.unresolvedGaps ?? [],
    gapsAcknowledged: irPayload?.gapsAcknowledged ?? null,
    moduleAntiPatterns: moduleAntiPatterns(
      getPackageIntelligence(pkg)?.effectiveModuleKey || getPackageIntelligence(pkg)?.inferredModuleKey
    ),
  };

  const handoff = await prisma.$transaction(async (tx) => {
    const h = await tx.cursorHandoff.create({
      data: {
        executionPackageId: pkg.id,
        handoffPrompt: prompt,
        repoContextJson: repoContext,
        fileTargetsJson: fileTargets,
        schemaContextJson: schemaContext,
        workflowContextJson: workflowContext,
        exportPayloadJson: exportPayload,
        status: 'READY',
      },
    });

    await tx.agentRunLog.create({
      data: {
        requestId: pkg.agentRequestId,
        actorType: 'USER',
        message: 'Cursor handoff generated (read-only export artifact)',
        metadata: {
          executionPackageId: pkg.id,
          cursorHandoffId: h.id,
          advanceToSentToDev,
        },
      },
    });

    if (advanceToSentToDev) {
      await tx.executionPackage.update({
        where: { id: pkg.id },
        data: { status: 'SENT_TO_DEV' },
      });
    }

    return h;
  });

  const auditCtx = getAuditContext(req);
  await createAuditLog({
    userId: actorUserId,
    action: 'CURSOR_HANDOFF_CREATED',
    entityType: ENTITY,
    entityId: handoff.id,
    afterValue: { executionPackageId: pkg.id, advancedToSentToDev: advanceToSentToDev },
    ...auditCtx,
  });

  return prisma.cursorHandoff.findUnique({
    where: { id: handoff.id },
  });
}

/**
 * @param {string} packageId
 */
export async function getLatestCursorHandoff(packageId) {
  return prisma.cursorHandoff.findFirst({
    where: { executionPackageId: packageId },
    orderBy: { createdAt: 'desc' },
  });
}
