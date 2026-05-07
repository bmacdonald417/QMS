/**
 * C3PAO audit — pass 3 (CORRECTION).
 *
 * Self-audit of the title-driven mappings I added in pass 1 + 2 found
 * that several mappings don't have backing CONTENT in the doc — they
 * were assumed-from-title rather than verified-against-text. A C3PAO
 * would (correctly) reject those as evidence-of-evidence with no real
 * mechanism behind them.
 *
 * Removals applied here, with rationale per remove:
 *
 *   MAC-IT-308 → remove 3.4.1
 *     The boundary doc shows architecture diagrams + data flows but does
 *     NOT establish baseline configurations or system component
 *     inventories (that's what 3.4.1 requires). Architecture ≠ baseline.
 *   MAC-IT-308 → remove 3.13.2
 *     3.13.2 is specifically about SDLC engineering principles; the
 *     boundary doc describes the deployed boundary, not the engineering
 *     practices that produced it.
 *
 *   MAC-GOV-SOP-003 → remove 3.12.4
 *     This is an internal contract-management SOP. Contract intake feeds
 *     into SSP scope conceptually but the doc does NOT develop, document,
 *     or update the SSP. 3.1.1 and 3.1.2 mappings are kept (real RBAC).
 *
 *   MAC-POL-218 → remove 3.12.3
 *     Audit and Accountability Policy covers 3.3.1–3.3.4 (audit log
 *     management). 3.12.3 is "monitor security controls on an ongoing
 *     basis to ensure their continued effectiveness" — that's control-
 *     effectiveness monitoring, not audit log management.
 *   MAC-SOP-226 → remove 3.12.3
 *     Audit Log Review Procedure — log review is operational, not
 *     control-effectiveness monitoring.
 *   MAC-SOP-239 → remove 3.12.3
 *     System Monitoring Procedures targets Defender alerts and
 *     unauthorized-use detection (3.14.3 / 3.14.7). It is not a
 *     procedure for assessing the ongoing effectiveness of the broader
 *     control set.
 *
 *   MAC-POL-221 → remove 3.7.6
 *     The Maintenance Policy explicitly DETERMINES this control N/A
 *     because the system is cloud-only and there are no on-site
 *     maintenance personnel without authorization. An N/A
 *     determination is not the same as backing the control with
 *     mechanism evidence.
 *
 * Net effect: the manifest will REGRESS in coverage for some
 * governance-18 controls. That regression is the truthful, C3PAO-
 * defensible state. Real gaps surfaced rather than fake-closed:
 *
 *   3.12.3 — no doc backs it. POA&M action: author a Continuous
 *            Control Monitoring SOP (separate from log review).
 *   3.7.6  — N/A per cloud architecture. Document the N/A
 *            determination in the SSP (MAC-IT-307); not a gap, but
 *            also not a "doc backs it" mapping.
 *
 *   railway run node scripts/c3paoMappingCorrection.js
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';

// document_number → list of control_ids to REMOVE from existing mapping
const REMOVALS = {
  'MAC-IT-308': ['3.4.1', '3.13.2'],
  'MAC-GOV-SOP-003': ['3.12.4'],
  'MAC-POL-218': ['3.12.3'],
  'MAC-SOP-226': ['3.12.3'],
  'MAC-SOP-239': ['3.12.3'],
  'MAC-POL-221': ['3.7.6'],
};

const RATIONALE = {
  'MAC-IT-308:3.4.1':
    'Boundary doc shows architecture diagrams; does not establish baselines or component inventories required by 3.4.1.',
  'MAC-IT-308:3.13.2':
    '3.13.2 is about SDLC engineering principles; the boundary doc describes deployed state, not engineering practice.',
  'MAC-GOV-SOP-003:3.12.4':
    'Internal contract-management SOP does not develop/document/update the SSP. 3.12.4 mapping was thin — removed.',
  'MAC-POL-218:3.12.3':
    'Audit and Accountability Policy covers 3.3.1–3.3.4 (log management). 3.12.3 requires control-effectiveness monitoring, not audit log management.',
  'MAC-SOP-226:3.12.3':
    'Audit log review procedure — operational log review ≠ ongoing control-effectiveness monitoring.',
  'MAC-SOP-239:3.12.3':
    'System monitoring procedures target Defender alerts (3.14.3/3.14.7), not control-effectiveness monitoring.',
  'MAC-POL-221:3.7.6':
    'Maintenance policy DETERMINES 3.7.6 not applicable per cloud-only architecture. N/A determination is not backing.',
};

async function main() {
  console.log('=== C3PAO mapping correction (pass 3) ===\n');
  console.log('Removing indefensible mappings surfaced by the self-audit.\n');

  for (const [docNumber, removeIds] of Object.entries(REMOVALS)) {
    const existing = await prisma.governanceControlMapping.findUnique({
      where: { documentNumber: docNumber },
    });
    if (!existing) {
      console.log(`   ${docNumber}: no row found, nothing to remove`);
      continue;
    }
    const before = [...existing.controlIds];
    const after = before.filter((c) => !removeIds.includes(c));
    if (after.length === before.length) {
      console.log(`   ${docNumber}: none of [${removeIds.join(', ')}] present, nothing to remove`);
      continue;
    }
    console.log(`   ${docNumber}: ${before.join(', ')} → ${after.length === 0 ? '(empty)' : after.join(', ')} (removed: ${removeIds.join(', ')})`);
    if (after.length === 0) {
      // Empty mapping = same as no mapping. Delete the row so the manifest
      // builder doesn't carry a hollow {} for the doc.
      await prisma.governanceControlMapping.delete({
        where: { documentNumber: docNumber },
      });
    } else {
      await prisma.governanceControlMapping.update({
        where: { documentNumber: docNumber },
        data: { controlIds: after },
      });
    }
    for (const removed of removeIds.filter((c) => before.includes(c))) {
      await prisma.auditLog.create({
        data: {
          id: randomUUID(),
          actorType: 'USER',
          action: 'GOVERNANCE_CONTROL_MAPPING_REMOVED',
          entityType: 'GovernanceControlMapping',
          entityId: docNumber,
          beforeValue: { documentNumber: docNumber, controlIds: before },
          afterValue: { documentNumber: docNumber, controlIds: after, removed },
          reason: RATIONALE[`${docNumber}:${removed}`] ?? 'self-audit removal',
        },
      });
    }
  }

  console.log('\n--- Post-correction state for affected docs ---');
  for (const docNumber of Object.keys(REMOVALS)) {
    const row = await prisma.governanceControlMapping.findUnique({
      where: { documentNumber: docNumber },
    });
    console.log(`   ${docNumber}: ${row ? row.controlIds.join(', ') : '(no mapping)'}`);
  }

  console.log('\n--- Honest gap list (governance-18 controls without backing) ---');
  console.log('   3.12.3  Monitor security controls on an ongoing basis');
  console.log('           → POA&M item: author a Continuous Control Monitoring SOP');
  console.log('   3.7.6   Supervise maintenance personnel without required access');
  console.log('           → N/A per cloud-only architecture (document in SSP)');

  await prisma.$disconnect();
  console.log('\nNext: re-publish v1.0.3 + re-push to codex.');
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
