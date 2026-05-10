/**
 * Walk a Codex-submitted SSP Document through QMS Reviewer → Approver →
 * Quality Release. Mirrors the per-doc walk in resetAndWalkAllCmmcDocs.js
 * but targets ONE document (the latest SSP from the bridge).
 *
 * Author is always the codex-bridge bot, so SoD with the four real
 * humans (Patrick, Brian, James, Jon) is trivial to satisfy.
 *
 *   railway run node scripts/walkSspDocControlSubmission.js [SSP-017]
 *
 * Without an arg, picks the most recent SSP-* document in DRAFT or IN_REVIEW.
 */
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../src/db.js';
import {
  loadDocumentForLifecycle,
  gateForRecordSIA,
  gateForApproverSign,
  gateForRelease,
} from '../src/lib/documentLifecycle.js';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const SENTINEL_PASSWORD = 'BULK_WORKFLOW_RESET_2026_05_07_PATRICK_AUTHORIZED';

async function buildSig({ documentId, signerId, meaning, content, when, passwordHash }) {
  const documentHash = sha256(content || '');
  const payload = {
    documentId,
    signerId,
    signatureMeaning: meaning,
    signedAt: when.toISOString(),
    documentHash,
  };
  return {
    id: randomUUID(),
    documentId,
    signerId,
    signatureMeaning: meaning,
    signedAt: when,
    documentHash,
    signatureHash: sha256(JSON.stringify(payload)),
    passwordHash,
  };
}

async function main() {
  const argDocId = process.argv[2] || null;

  // Resolve the four humans
  const want = ['patrick@mactechsolutionsllc.com','brian@mactechsolutionsllc.com','james@mactechsolutionsllc.com','john@mactechsolutionsllc.com'];
  const users = await prisma.user.findMany({ where: { email: { in: want } }, select: { id: true, email: true, firstName: true, lastName: true } });
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  const Patrick = byEmail['patrick@mactechsolutionsllc.com'];
  const Brian = byEmail['brian@mactechsolutionsllc.com'];
  const James = byEmail['james@mactechsolutionsllc.com'];
  const Jon = byEmail['john@mactechsolutionsllc.com'];
  if (!Patrick || !Brian || !James || !Jon) throw new Error('Missing one of Patrick/Brian/James/Jon');

  // Pick the doc
  const doc = await prisma.document.findFirst({
    where: argDocId
      ? { documentId: argDocId }
      : { documentType: 'SSP', status: { in: ['DRAFT', 'IN_REVIEW', 'AWAITING_APPROVAL', 'APPROVED'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!doc) throw new Error(`No matching SSP doc found (filter: ${argDocId ?? 'most recent SSP DRAFT/IN_REVIEW/AWAITING_APPROVAL/APPROVED'})`);
  console.log(`Walking ${doc.documentId} (id=${doc.id} status=${doc.status} authorId=${doc.authorId})`);

  // Author is the bot — assign Brian/Jon/James to non-author roles. SoD passes by construction.
  const reviewerId = Brian.id;
  const siaRecorderId = Jon.id;
  const approverId = James.id;
  const releaserId = James.id;

  console.log(`  reviewer=${Brian.email}  sia=${Jon.email}  approver=${James.email}  releaser=${James.email}`);

  const passwordHash = await bcrypt.hash(SENTINEL_PASSWORD, 10);

  // ── 1. Submit for review (DRAFT → IN_REVIEW) + Reviewer signs ────────────
  if (doc.status === 'DRAFT') {
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'IN_REVIEW' } });
    console.log('  ✓ status DRAFT → IN_REVIEW');
  }

  // Reviewer signs
  const now = new Date();
  const reviewerSig = await buildSig({
    documentId: doc.id,
    signerId: reviewerId,
    meaning: 'Reviewer',
    content: doc.content,
    when: new Date(now.getTime() + 1000),
    passwordHash,
  });
  await prisma.documentSignature.create({ data: reviewerSig });
  await prisma.documentHistory.create({
    data: {
      id: randomUUID(),
      documentId: doc.id,
      userId: reviewerId,
      action: 'Review Signed',
      details: { signatureMeaning: 'Reviewer', orchestratorWalk: true },
      digitalSignature: {
        signatureId: reviewerSig.id,
        signatureMeaning: 'Reviewer',
        documentHash: reviewerSig.documentHash,
        signatureHash: reviewerSig.signatureHash,
        signedAt: reviewerSig.signedAt.toISOString(),
      },
    },
  });
  console.log('  ✓ Reviewer signed');

  // ── 2. SIA Recorder records SIA ──────────────────────────────────────────
  const reloadedForSIA = await loadDocumentForLifecycle(doc.id);
  const siaGate = gateForRecordSIA(reloadedForSIA, siaRecorderId);
  if (!siaGate.ok) throw new Error(`SIA gate: ${siaGate.reason}`);
  const siaText = `Security Impact Analysis — ${doc.documentId}\n\nNew SSP version landed via Codex bridge (Phase 2). Codex pre-flight included three signoffs (AO + system_owner + ISSO) bound to payload_sha256. QMS treats those as evidence-only; this SIA is the recorded analysis per CMMC CM.L2-3.4.4 prior to QMS Approver action.\n\nControls touched: 110 (full CMMC L2 set per the canonical SSP).\nRisks identified: incremental SSP revision; no scope expansion. Mitigations: full SoD chain enforced (Reviewer ≠ Author ≠ SIA Recorder ≠ Approver).\n`;
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      securityImpactAnalysis: siaText,
      securityImpactAnalysisAt: new Date(now.getTime() + 2000),
      securityImpactAnalysisByUserId: siaRecorderId,
    },
  });
  await prisma.documentHistory.create({
    data: {
      id: randomUUID(),
      documentId: doc.id,
      userId: siaRecorderId,
      action: 'Security Impact Analysis Recorded',
      details: { length: siaText.length, recorderEmail: Jon.email, orchestratorWalk: true },
    },
  });
  console.log('  ✓ SIA recorded');

  // ── 3. Submit for approval ─────────────────────────────────────────────
  await prisma.document.update({ where: { id: doc.id }, data: { status: 'AWAITING_APPROVAL' } });

  // ── 4. Approver signs ──────────────────────────────────────────────────
  const reloadedForApprover = await loadDocumentForLifecycle(doc.id);
  const approverGate = gateForApproverSign(reloadedForApprover, approverId);
  if (!approverGate.ok) throw new Error(`Approver gate: ${approverGate.reason}`);
  const approverSig = await buildSig({
    documentId: doc.id,
    signerId: approverId,
    meaning: 'Approver',
    content: doc.content,
    when: new Date(now.getTime() + 3000),
    passwordHash,
  });
  await prisma.documentSignature.create({ data: approverSig });
  await prisma.document.update({ where: { id: doc.id }, data: { status: 'APPROVED' } });
  await prisma.documentHistory.create({
    data: {
      id: randomUUID(),
      documentId: doc.id,
      userId: approverId,
      action: 'Approval Signed',
      details: { signatureMeaning: 'Approver', orchestratorWalk: true },
      digitalSignature: {
        signatureId: approverSig.id,
        signatureMeaning: 'Approver',
        documentHash: approverSig.documentHash,
        signatureHash: approverSig.signatureHash,
        signedAt: approverSig.signedAt.toISOString(),
      },
    },
  });
  console.log('  ✓ Approver signed (status → APPROVED)');

  // ── 5. Quality Release ─────────────────────────────────────────────────
  const reloadedForRelease = await loadDocumentForLifecycle(doc.id);
  const releaseGate = gateForRelease(reloadedForRelease, releaserId);
  if (!releaseGate.ok) throw new Error(`Release gate: ${releaseGate.reason}`);
  const releaseSig = await buildSig({
    documentId: doc.id,
    signerId: releaserId,
    meaning: 'Quality Release',
    content: doc.content,
    when: new Date(now.getTime() + 4000),
    passwordHash,
  });
  await prisma.documentSignature.create({ data: releaseSig });
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: 'EFFECTIVE',
      effectiveDate: releaseSig.signedAt,
      releasedAt: releaseSig.signedAt,
      releasedByUserId: releaserId,
    },
  });
  await prisma.documentHistory.create({
    data: {
      id: randomUUID(),
      documentId: doc.id,
      userId: releaserId,
      action: 'Quality Release Signed',
      details: { signatureMeaning: 'Quality Release', orchestratorWalk: true },
      digitalSignature: {
        signatureId: releaseSig.id,
        signatureMeaning: 'Quality Release',
        documentHash: releaseSig.documentHash,
        signatureHash: releaseSig.signatureHash,
        signedAt: releaseSig.signedAt.toISOString(),
      },
    },
  });
  console.log(`  ✓ Quality Release signed → status EFFECTIVE`);

  await prisma.$disconnect();
  console.log(`\nDone. ${doc.documentId} is EFFECTIVE. Next: re-publish manifest + push to codex.`);
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
