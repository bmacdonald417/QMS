/**
 * @param {string | null | undefined} moduleKey
 * @param {string} packageType
 */
export function suggestFixtures(moduleKey, packageType) {
  /** @type {Array<Record<string, unknown>>} */
  const out = [];

  const base = {
    label: 'Multi-revision controlled SOP',
    module: 'document-control',
    purpose: 'Validate draft → in-review → approved → effective transitions and PDF/hash behaviors.',
    suggestedFields: ['documentId', 'revision rows', 'status', 'effectiveDate', 'signatures', 'audit events'],
    whenToUse: 'UI/workflow changes touch document lifecycle, approvals, or evidence export.',
  };
  out.push(base);

  out.push({
    label: 'CAPA with containment + effectiveness',
    module: 'capa',
    purpose: 'Exercise due dates, ownership, containment actions, and effectiveness checks.',
    suggestedFields: ['owner', 'priority', 'containment', 'rootCause', 'effectivenessReview', 'closure evidence'],
    whenToUse: 'CAPA workflow, notifications, or reporting changes.',
  });

  out.push({
    label: 'Training assignments (overdue + completed)',
    module: 'training',
    purpose: 'Validate assignment states, reminders, completions, and read-and-understood evidence.',
    suggestedFields: ['assignee', 'dueAt', 'completedAt', 'documentRevision link', 'overdue flag'],
    whenToUse: 'Training module UX, notifications, or linkage to document revisions.',
  });

  out.push({
    label: 'Supplier qualification packet',
    module: 'supplier-quality',
    purpose: 'Validate approvals, qualification tiers, and audit-friendly attachment metadata.',
    suggestedFields: ['supplier name', 'tier', 'approval chain', 'audit dates', 'attachments'],
    whenToUse: 'Supplier qualification or SCAR-like flows.',
  });

  out.push({
    label: 'Change control record with evidence links',
    module: 'change-control',
    purpose: 'Validate implementation evidence, approvals, and traceability to affected systems.',
    suggestedFields: ['change description', 'risk', 'implementation plan', 'approvals', 'linked documents'],
    whenToUse: packageType === 'MIXED' || packageType === 'WORKFLOW_BUILD',
  });

  if (moduleKey && typeof moduleKey === 'string') {
    return out.filter((s) => s.module === moduleKey || moduleKey === 'unknown');
  }
  return out;
}
