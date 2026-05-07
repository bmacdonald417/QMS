/**
 * Pass 2 of the C3PAO audit remediation: close the gaps where the
 * MacTech doc set has content for a governance-18 control but the
 * mapping table doesn't reflect it yet.
 *
 * Findings (cross-referencing GOVERNANCE_18_CONTROL_IDS against the
 * latest manifest run on codex):
 *
 *   gap            existing doc(s) that DO cover it
 *   ─────────────  ──────────────────────────────────────────────────
 *   3.4.4 (SIA)    MAC-CMP-001, MAC-SOP-225
 *   3.12.3 (cont)  MAC-POL-218, MAC-SOP-226, MAC-SOP-239
 *   3.2.2 (insider) MAC-POL-219, MAC-SOP-227
 *   3.2.3 (insider) MAC-POL-219, MAC-SOP-227
 *   3.6.2 (track)  MAC-POL-215
 *   3.7.6 (maint)  MAC-POL-221
 *
 * Each mapping is APPENDED to the existing control_ids array (not
 * overwritten) and is audit-logged. A C3PAO can replay the audit log
 * to see why each new control_id was added.
 *
 *   railway run node scripts/c3paoCloseGovernance18Gaps.js
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';

// Each entry: documentNumber → { add: [controlIds], rationale: string }
const ADDITIONS = {
  'MAC-CMP-001': {
    add: ['3.4.4'],
    rationale:
      'CMMC CM.L2-3.4.4 — Security Impact Analysis prior to changes. The Configuration Management Plan is the procedural backbone for SIA execution.',
  },
  'MAC-SOP-225': {
    add: ['3.4.4'],
    rationale:
      'CMMC CM.L2-3.4.4 — Configuration Change Awareness Procedure IS the SIA procedure (analyze impact prior to implementation).',
  },
  'MAC-POL-218': {
    add: ['3.12.3'],
    rationale:
      'CMMC CA.L2-3.12.3 — continuous monitoring of security controls. The Audit and Accountability Policy mandates the ongoing-monitoring posture.',
  },
  'MAC-SOP-226': {
    add: ['3.12.3'],
    rationale:
      'CMMC CA.L2-3.12.3 — the Audit Log Review Procedure is the operational mechanism for ongoing control monitoring.',
  },
  'MAC-SOP-239': {
    add: ['3.12.3'],
    rationale:
      'CMMC CA.L2-3.12.3 — Procedures for System Monitoring are the technical mechanism for continuous monitoring.',
  },
  'MAC-POL-219': {
    add: ['3.2.2', '3.2.3'],
    rationale:
      'CMMC AT.L2-3.2.2 + AT.L2-3.2.3 — Awareness and Training Policy explicitly covers insider-threat awareness and recognition training.',
  },
  'MAC-SOP-227': {
    add: ['3.2.2', '3.2.3'],
    rationale:
      'CMMC AT.L2-3.2.2 + AT.L2-3.2.3 — Security Awareness Training Procedure delivers the insider-threat awareness curriculum.',
  },
  'MAC-POL-215': {
    add: ['3.6.2'],
    rationale:
      'CMMC IR.L2-3.6.2 — Incident Response Policy mandates incident tracking, documentation, and reporting.',
  },
  'MAC-POL-221': {
    add: ['3.7.6'],
    rationale:
      'CMMC MA.L2-3.7.6 — Maintenance Policy governs supervision of maintenance personnel without required access.',
  },
};

async function main() {
  console.log('=== C3PAO governance-18 gap closure (pass 2) ===\n');

  for (const [docNumber, { add, rationale }] of Object.entries(ADDITIONS)) {
    const existing = await prisma.governanceControlMapping.findUnique({
      where: { documentNumber: docNumber },
    });
    if (!existing) {
      console.log(`   ${docNumber}: no mapping row found, creating with ${add.join(', ')}`);
      await prisma.governanceControlMapping.create({
        data: {
          id: randomUUID(),
          documentNumber: docNumber,
          controlIds: add,
        },
      });
    } else {
      const merged = Array.from(new Set([...(existing.controlIds ?? []), ...add])).sort();
      const newOnes = add.filter((c) => !(existing.controlIds ?? []).includes(c));
      if (newOnes.length === 0) {
        console.log(`   ${docNumber}: already covers ${add.join(', ')}, skipping`);
        continue;
      }
      console.log(
        `   ${docNumber}: ${existing.controlIds.join(', ')} → ${merged.join(', ')} (added: ${newOnes.join(', ')})`,
      );
      await prisma.governanceControlMapping.update({
        where: { documentNumber: docNumber },
        data: { controlIds: merged },
      });
    }
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        actorType: 'USER',
        action: 'GOVERNANCE_CONTROL_MAPPING_AUGMENTED',
        entityType: 'GovernanceControlMapping',
        entityId: docNumber,
        afterValue: {
          documentNumber: docNumber,
          addedControlIds: add,
          rationale,
        },
        reason: 'C3PAO audit pass 2 — governance-18 gap closure',
      },
    });
  }
  console.log();

  // Print final mappings for the affected docs
  const final = await prisma.governanceControlMapping.findMany({
    where: { documentNumber: { in: Object.keys(ADDITIONS) } },
    orderBy: { documentNumber: 'asc' },
  });
  console.log('Post-state (docs touched by this pass):');
  for (const m of final) {
    console.log(`   ${m.documentNumber}: ${m.controlIds.join(', ')}`);
  }

  await prisma.$disconnect();
  console.log('\nNext: re-publish v1.0.2 and re-push to codex.');
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
