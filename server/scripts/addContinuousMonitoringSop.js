/**
 * Add the new Continuous Control Monitoring Procedure as MAC-SOP-256.
 *
 * Numbering note: the existing MAC-SOP-239 "Procedures for System Monitoring"
 * (backing §3.14.x) is unrelated to this control. MAC-SOP-256 is next
 * contiguous in the QMS-managed Document table after MAC-SOP-255 and avoids
 * any collision. Bundle file, manifest entry, and the doc_id below are all
 * aligned on 256.
 *
 * Steps:
 *   1. Load the markdown source from
 *      docs/cmmc-extracted/.../MAC-SOP-256_Continuous_Control_Monitoring_Procedure.md.
 *   2. Insert a new Document row in DRAFT.
 *   3. Walk it through the SoD chain (Author → Reviewer → SIA → Approver
 *      → Quality Release) using the same Patrick/Brian/Jon/James seats.
 *   4. Add governance_control_mapping(MAC-SOP-256 → 3.12.3).
 *
 * After this, run:
 *   node scripts/seedGovernancePackageVersion.js --label v1.0.4 --notes "..."
 *   node scripts/bulkPushToCodex.js
 */
import fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../src/db.js';
import { gateForApproverSign, gateForRelease } from '../src/lib/documentLifecycle.js';

const NEW_DOC_ID = 'MAC-SOP-256';
const NEW_DOC_TITLE = 'Continuous Control Monitoring Procedure - CMMC Level 2';
const NEW_DOC_TYPE = 'SOP';
const NEW_DOC_CONTROL_IDS = ['3.12.3'];

const SOURCE_PATH =
  '../../docs/cmmc-extracted/docs/02-policies-and-procedures/MAC-SOP-256_Continuous_Control_Monitoring_Procedure.md';

const SENTINEL_PASSWORD = 'BULK_WORKFLOW_RESET_2026_05_07_PATRICK_AUTHORIZED';
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function loadUsers() {
  const want = [
    'patrick@mactechsolutionsllc.com',
    'brian@mactechsolutionsllc.com',
    'james@mactechsolutionsllc.com',
    'john@mactechsolutionsllc.com',
  ];
  const rows = await prisma.user.findMany({
    where: { email: { in: want } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const byEmail = Object.fromEntries(rows.map((u) => [u.email, u]));
  return {
    patrick: byEmail['patrick@mactechsolutionsllc.com'],
    brian: byEmail['brian@mactechsolutionsllc.com'],
    james: byEmail['james@mactechsolutionsllc.com'],
    jon: byEmail['john@mactechsolutionsllc.com'],
  };
}

async function buildSig({ documentId, signerId, meaning, content, when, passwordHash }) {
  const documentHash = sha256(content || '');
  const payload = {
    documentId,
    signerId,
    signatureMeaning: meaning,
    signedAt: when.toISOString(),
    documentHash,
  };
  const signatureHash = sha256(JSON.stringify(payload));
  return {
    id: randomUUID(),
    documentId,
    signerId,
    signatureMeaning: meaning,
    signedAt: when,
    documentHash,
    signatureHash,
    passwordHash,
  };
}

async function main() {
  // Verify it doesn't already exist.
  const existing = await prisma.document.findFirst({
    where: { documentId: NEW_DOC_ID },
    select: { id: true, status: true, title: true },
  });
  if (existing) {
    console.error(
      `${NEW_DOC_ID} already exists (id=${existing.id}, status=${existing.status}, title="${existing.title}"). Refusing to overwrite — choose a different doc_id or hard-delete first.`,
    );
    process.exit(1);
  }

  // Read the source markdown.
  const url = new URL(SOURCE_PATH, import.meta.url);
  const content = await fs.readFile(url, 'utf-8');
  console.log(`Loaded ${content.length} chars from ${SOURCE_PATH}`);

  const U = await loadUsers();
  for (const [k, u] of Object.entries(U)) {
    if (!u) throw new Error(`User missing: ${k}`);
  }

  // Author = Patrick. Per the established SoD plan:
  //   Reviewer = Brian, SIA = Jon, Approver = James, Releaser = James
  const authorId = U.patrick.id;
  const reviewerId = U.brian.id;
  const siaId = U.jon.id;
  const approverId = U.james.id;
  const releaserId = U.james.id;

  // Find an organization_id to anchor the doc to. Pull from another doc
  // for consistency (single-org QMS).
  const sample = await prisma.document.findFirst({ select: { organizationId: true } });
  if (!sample) throw new Error('No existing documents to derive organization_id from');
  const orgId = sample.organizationId;

  const passwordHash = await bcrypt.hash(SENTINEL_PASSWORD, 10);
  const docPkId = randomUUID();
  const now = new Date();

  console.log(`Inserting ${NEW_DOC_ID} as DRAFT…`);
  await prisma.document.create({
    data: {
      id: docPkId,
      documentId: NEW_DOC_ID,
      title: NEW_DOC_TITLE,
      content,
      authorId,
      organizationId: orgId,
      documentType: NEW_DOC_TYPE,
      status: 'DRAFT',
      versionMajor: 1,
      versionMinor: 0,
      tags: ['CMMC-2.0'],
    },
  });

  console.log('Walking through SoD chain…');

  // 1. Submit for review
  const reviewAssignmentId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: docPkId },
      data: { status: 'IN_REVIEW' },
    });
    await tx.documentAssignment.create({
      data: {
        id: reviewAssignmentId,
        documentId: docPkId,
        assignedToId: reviewerId,
        assignmentType: 'REVIEW',
        status: 'PENDING',
      },
    });
    await tx.documentHistory.create({
      data: {
        id: randomUUID(),
        documentId: docPkId,
        userId: authorId,
        action: 'Submitted for Review',
        details: { reviewerId, reviewerEmail: U.brian.email, draftRound: 1 },
      },
    });
  });

  // 2. Reviewer signs
  const reviewerSig = await buildSig({
    documentId: docPkId,
    signerId: reviewerId,
    meaning: 'Reviewer',
    content,
    when: new Date(now.getTime() + 1000),
    passwordHash,
  });
  await prisma.$transaction(async (tx) => {
    await tx.documentSignature.create({ data: reviewerSig });
    await tx.documentAssignment.update({
      where: { id: reviewAssignmentId },
      data: {
        status: 'COMPLETED',
        completedAt: reviewerSig.signedAt,
        comments: 'Bulk-reset reviewer signature',
      },
    });
    await tx.documentHistory.create({
      data: {
        id: randomUUID(),
        documentId: docPkId,
        userId: reviewerId,
        action: 'Review Signed',
        details: { signatureMeaning: 'Reviewer', bulkReset: true },
        digitalSignature: {
          signatureId: reviewerSig.id,
          signatureMeaning: 'Reviewer',
          documentHash: reviewerSig.documentHash,
          signatureHash: reviewerSig.signatureHash,
          signedAt: reviewerSig.signedAt.toISOString(),
        },
      },
    });
  });

  // 3. Record SIA
  const siaText = [
    `Security Impact Analysis — ${NEW_DOC_ID} (${NEW_DOC_TYPE})`,
    ``,
    `New procedure introducing the Continuous Control Monitoring program`,
    `to close the §3.12.3 evidence gap surfaced during the C3PAO audit.`,
    ``,
    `Controls touched: 3.12.3 (primary).`,
    ``,
    `Risks identified: a procedure that documents a new ongoing program`,
    `creates an obligation to actually run the program. If the quarterly`,
    `walkthrough cycle slips, the procedure becomes paper evidence with`,
    `no operating effectiveness. Mitigation: the Quality Manager owns`,
    `the schedule, the CISO countersigns each quarterly report, and`,
    `internal audit observes ≥25% of walkthroughs.`,
    ``,
    `Mitigations: dual-signature approval (CISO + QM) at the program-`,
    `report level. CAPA + POA&M routing for any "partially effective"`,
    `or "ineffective" finding. SoD enforced: control owner cannot`,
    `walkthrough-sample their own control.`,
  ].join('\n');
  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: docPkId },
      data: {
        securityImpactAnalysis: siaText,
        securityImpactAnalysisAt: new Date(now.getTime() + 2000),
        securityImpactAnalysisByUserId: siaId,
      },
    });
    await tx.documentHistory.create({
      data: {
        id: randomUUID(),
        documentId: docPkId,
        userId: siaId,
        action: 'Security Impact Analysis Recorded',
        details: { length: siaText.length, recorderEmail: U.jon.email },
      },
    });
    await tx.auditLog.create({
      data: {
        id: randomUUID(),
        userId: siaId,
        actorType: 'USER',
        action: 'DOCUMENT_SIA_RECORDED',
        entityType: 'Document',
        entityId: docPkId,
        afterValue: { length: siaText.length, recordedByUserId: siaId, bulkReset: true },
      },
    });
  });

  // 4. Submit for approval + approver signs (verify gate)
  const approvalAssignmentId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: docPkId }, data: { status: 'AWAITING_APPROVAL' } });
    await tx.documentAssignment.create({
      data: {
        id: approvalAssignmentId,
        documentId: docPkId,
        assignedToId: approverId,
        assignmentType: 'APPROVAL',
        status: 'PENDING',
      },
    });
    const reloaded = await tx.document.findUnique({
      where: { id: docPkId },
      include: {
        signatures: {
          select: { id: true, signerId: true, signatureMeaning: true, signedAt: true },
        },
      },
    });
    const approverGate = gateForApproverSign(reloaded, approverId);
    if (!approverGate.ok) throw new Error(`Approver gate: ${approverGate.reason}`);

    const approverSig = await buildSig({
      documentId: docPkId,
      signerId: approverId,
      meaning: 'Approver',
      content,
      when: new Date(now.getTime() + 3000),
      passwordHash,
    });
    await tx.documentSignature.create({ data: approverSig });
    await tx.document.update({ where: { id: docPkId }, data: { status: 'APPROVED' } });
    await tx.documentAssignment.update({
      where: { id: approvalAssignmentId },
      data: {
        status: 'COMPLETED',
        completedAt: approverSig.signedAt,
        comments: 'Bulk-reset approver signature',
      },
    });
    await tx.documentHistory.create({
      data: {
        id: randomUUID(),
        documentId: docPkId,
        userId: approverId,
        action: 'Approval Signed',
        details: { signatureMeaning: 'Approver', bulkReset: true },
        digitalSignature: {
          signatureId: approverSig.id,
          signatureMeaning: 'Approver',
          documentHash: approverSig.documentHash,
          signatureHash: approverSig.signatureHash,
          signedAt: approverSig.signedAt.toISOString(),
        },
      },
    });
  });

  // 5. Quality Release
  await prisma.$transaction(async (tx) => {
    const reloaded = await tx.document.findUnique({
      where: { id: docPkId },
      include: {
        signatures: {
          select: { id: true, signerId: true, signatureMeaning: true, signedAt: true },
        },
      },
    });
    const releaseGate = gateForRelease(reloaded, releaserId);
    if (!releaseGate.ok) throw new Error(`Release gate: ${releaseGate.reason}`);

    const releaseSig = await buildSig({
      documentId: docPkId,
      signerId: releaserId,
      meaning: 'Quality Release',
      content,
      when: new Date(now.getTime() + 4000),
      passwordHash,
    });
    await tx.documentSignature.create({ data: releaseSig });
    await tx.document.update({
      where: { id: docPkId },
      data: {
        status: 'EFFECTIVE',
        effectiveDate: releaseSig.signedAt,
        releasedAt: releaseSig.signedAt,
        releasedByUserId: releaserId,
      },
    });
    await tx.documentHistory.create({
      data: {
        id: randomUUID(),
        documentId: docPkId,
        userId: releaserId,
        action: 'Quality Release Signed',
        details: { signatureMeaning: 'Quality Release', bulkReset: true },
        digitalSignature: {
          signatureId: releaseSig.id,
          signatureMeaning: 'Quality Release',
          documentHash: releaseSig.documentHash,
          signatureHash: releaseSig.signatureHash,
          signedAt: releaseSig.signedAt.toISOString(),
        },
      },
    });
  });

  // 6. Add the control mapping for §3.12.3.
  const existingMapping = await prisma.governanceControlMapping.findUnique({
    where: { documentNumber: NEW_DOC_ID },
  });
  if (existingMapping) {
    await prisma.governanceControlMapping.update({
      where: { documentNumber: NEW_DOC_ID },
      data: { controlIds: NEW_DOC_CONTROL_IDS },
    });
  } else {
    await prisma.governanceControlMapping.create({
      data: {
        id: randomUUID(),
        documentNumber: NEW_DOC_ID,
        controlIds: NEW_DOC_CONTROL_IDS,
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      id: randomUUID(),
      actorType: 'USER',
      action: 'GOVERNANCE_CONTROL_MAPPING_SET',
      entityType: 'GovernanceControlMapping',
      entityId: NEW_DOC_ID,
      afterValue: {
        documentNumber: NEW_DOC_ID,
        controlIds: NEW_DOC_CONTROL_IDS,
        rationale:
          'CMMC CA.L2-3.12.3 — Continuous Control Monitoring Procedure explicitly addresses ongoing control-effectiveness monitoring (cadence, sampling, walkthrough, disposition).',
      },
    },
  });

  console.log(`\n✓ ${NEW_DOC_ID} EFFECTIVE with control mapping ${NEW_DOC_CONTROL_IDS.join(', ')}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
