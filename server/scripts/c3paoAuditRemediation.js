/**
 * C3PAO audit remediation for the 5 docs missing control mappings.
 *
 * As-found (after the 2026-05-06 reset+walk):
 *   MAC-GOV-SOP-003  Contract Intake & Lifecycle Management   (REAL)
 *   MAC-IT-307       System Security Plan - CMMC Level 2      (REAL — THE SSP)
 *   MAC-IT-308       System Boundary & Data Handling Statement (REAL)
 *   MAC-SOP-069      "test"                                    (JUNK — 11 chars)
 *   MAC-SOP-255      "Test"                                    (JUNK — 11 chars)
 *
 * Actions (defensible per AssessmentGuide L2v2):
 *
 *   1. Tag the three real docs in governance_control_mapping:
 *      MAC-GOV-SOP-003 → 3.1.1, 3.1.2, 3.12.4
 *        (role-based contract intake feeds SSP scope + AC objectives)
 *      MAC-IT-307 → 3.12.4
 *        (the SSP IS the artifact satisfying CA.L2-3.12.4)
 *      MAC-IT-308 → 3.4.1, 3.12.4, 3.13.1, 3.13.2, 3.13.5
 *        (boundary statement backs CM/CA/SC families)
 *
 *   2. Hard-delete MAC-SOP-069 + MAC-SOP-255 (the test stubs). These
 *      were erroneously promoted to EFFECTIVE during the bulk walk.
 *      Their content is "test"/"Test" with no real procedural value.
 *      Per CMMC L2 doc-control hygiene, junk-content docs should not
 *      live in the released governance bundle. The DELETE cascades
 *      through signatures, history, assignments, comments, etc.
 *
 *   3. Audit-log every action so the C3PAO can see the decision trail.
 *
 *   railway run node scripts/c3paoAuditRemediation.js
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';

const MAPPINGS = {
  'MAC-GOV-SOP-003': ['3.1.1', '3.1.2', '3.12.4'],
  'MAC-IT-307': ['3.12.4'],
  'MAC-IT-308': ['3.4.1', '3.12.4', '3.13.1', '3.13.2', '3.13.5'],
};

const JUNK_DOC_IDS = ['MAC-SOP-069', 'MAC-SOP-255'];

const REMEDIATION_REASON =
  'C3PAO audit follow-up: junk test stub erroneously promoted to EFFECTIVE during the 2026-05-06 bulk SoD walk. Content is "test"/"Test" with no procedural value. Removing per CMMC L2 doc-control hygiene; not part of the released governance bundle.';

async function main() {
  console.log('=== C3PAO audit remediation ===\n');

  // ── 1. Apply control mappings ────────────────────────────────────────────
  console.log('1. Applying governance_control_mapping rows…');
  for (const [docNumber, controlIds] of Object.entries(MAPPINGS)) {
    const existing = await prisma.governanceControlMapping.findUnique({
      where: { documentNumber: docNumber },
    });
    if (existing) {
      console.log(`   ${docNumber}: existing mapping → ${existing.controlIds.join(', ')}; updating to ${controlIds.join(', ')}`);
      await prisma.governanceControlMapping.update({
        where: { documentNumber: docNumber },
        data: { controlIds },
      });
    } else {
      console.log(`   ${docNumber}: NEW mapping → ${controlIds.join(', ')}`);
      await prisma.governanceControlMapping.create({
        data: {
          id: randomUUID(),
          documentNumber: docNumber,
          controlIds,
        },
      });
    }
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        actorType: 'USER',
        action: 'GOVERNANCE_CONTROL_MAPPING_SET',
        entityType: 'GovernanceControlMapping',
        entityId: docNumber,
        afterValue: { documentNumber: docNumber, controlIds, reason: 'C3PAO audit remediation' },
      },
    });
  }
  console.log();

  // ── 2. Hard-delete the junk test stubs ──────────────────────────────────
  console.log('2. Removing junk test-stub docs from the bundle…');
  for (const junkDocId of JUNK_DOC_IDS) {
    const doc = await prisma.document.findFirst({
      where: { documentId: junkDocId },
      select: {
        id: true,
        documentId: true,
        title: true,
        documentType: true,
        status: true,
        content: true,
      },
    });
    if (!doc) {
      console.log(`   ${junkDocId}: not found, skipping`);
      continue;
    }
    const charCount = (doc.content ?? '').length;
    console.log(`   ${junkDocId}: deleting (status=${doc.status}, content_chars=${charCount})`);

    await prisma.$transaction(async (tx) => {
      // Detach any superseder pointers (none expected; defensive).
      await tx.document.updateMany({
        where: { supersedesDocumentId: doc.id },
        data: { supersedesDocumentId: null },
      });
      await tx.documentLink.deleteMany({
        where: { OR: [{ sourceDocumentId: doc.id }, { targetDocumentId: doc.id }] },
      });
      await tx.documentComment.deleteMany({ where: { documentId: doc.id } });
      await tx.documentHistory.deleteMany({ where: { documentId: doc.id } });
      await tx.documentSignature.deleteMany({ where: { documentId: doc.id } });
      await tx.documentAssignment.deleteMany({ where: { documentId: doc.id } });
      await tx.documentRevision.deleteMany({ where: { documentId: doc.id } });
      await tx.periodicReview.deleteMany({ where: { documentId: doc.id } });
      // Training modules + records (junk shouldn't have any, but safe).
      const modules = await tx.trainingModule.findMany({
        where: { documentId: doc.id },
        select: { id: true },
      });
      for (const m of modules) {
        await tx.userTrainingRecord.deleteMany({ where: { trainingModuleId: m.id } });
      }
      await tx.trainingModule.deleteMany({ where: { documentId: doc.id } });
      // CMMC tag join rows.
      await tx.documentCmmcControlTag.deleteMany({ where: { documentId: doc.id } });
      // Finally, the document itself.
      await tx.document.delete({ where: { id: doc.id } });
      // Audit-log AFTER delete completes (no FK risk).
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          actorType: 'USER',
          action: 'DOCUMENT_DELETED',
          entityType: 'Document',
          entityId: doc.id,
          beforeValue: {
            documentId: doc.documentId,
            title: doc.title,
            documentType: doc.documentType,
            status: doc.status,
            contentChars: charCount,
          },
          reason: REMEDIATION_REASON,
        },
      });
    });
    console.log(`   ${junkDocId}: deleted ✓`);
  }
  console.log();

  // ── 3. Print the post-state summary ─────────────────────────────────────
  console.log('3. Post-state:');
  const mapped = await prisma.governanceControlMapping.findMany({
    where: { documentNumber: { in: Object.keys(MAPPINGS) } },
    orderBy: { documentNumber: 'asc' },
  });
  for (const m of mapped) {
    console.log(`   ${m.documentNumber}: ${m.controlIds.join(', ')}`);
  }
  const docCount = await prisma.document.count({
    where: {
      documentType: {
        in: [
          'POLICY',
          'SOP',
          'WORK_INSTRUCTION',
          'INCIDENT_RESPONSE_PLAN',
          'CONFIGURATION_MANAGEMENT_PLAN',
          'IT_SYSTEM',
          'SECURITY',
          'AUDIT_ASSESSMENT',
        ],
      },
    },
  });
  console.log(`\n   CMMC-group document count: ${docCount} (was 54, expecting 52)`);

  await prisma.$disconnect();
  console.log('\nDone. Next steps:');
  console.log('  - re-publish Vault Package: railway run node scripts/seedGovernancePackageVersion.js --label v1.0.1 --notes "C3PAO audit: 3 mappings added, 2 junk stubs removed"');
  console.log('  - re-push to codex:        railway run node scripts/bulkPushToCodex.js');
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
