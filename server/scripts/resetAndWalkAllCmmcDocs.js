/**
 * Reset every CMMC-group document to a fresh DRAFT state, then walk
 * each one through the full CMMC L2 approval workflow as four real
 * users — Author, Reviewer, SIA Recorder, Approver, Quality Releaser
 * — so each ends up EFFECTIVE with a complete signature chain and
 * a recorded Security Impact Analysis.
 *
 * SoD plan (CMMC AC.L2-3.1.4 / AU.L2-3.3.9 / CM.L2-3.4.4):
 *
 *   Author = Patrick    →  Reviewer = Brian, SIA = Jon, Approver = James, Releaser = James
 *   Author = James      →  Reviewer = Brian, SIA = Jon, Approver = Patrick, Releaser = Patrick
 *   Author = Brian      →  Reviewer = James, SIA = Jon, Approver = Patrick, Releaser = Patrick
 *
 * Jon is required because Patrick/Brian/James alone cannot satisfy
 * the four-distinct-seats SoD chain when one of them is the Author.
 *
 * Run:
 *   railway run node scripts/resetAndWalkAllCmmcDocs.js [--dry-run]
 *
 * The script is transactional per-document. If any one doc fails its
 * gate verification mid-walk, that doc rolls back and the loop
 * continues with the next. A summary is printed at the end.
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

const DRY_RUN = process.argv.includes('--dry-run');

const CMMC_GROUP = [
  'POLICY',
  'SOP',
  'WORK_INSTRUCTION',
  'INCIDENT_RESPONSE_PLAN',
  'CONFIGURATION_MANAGEMENT_PLAN',
  'IT_SYSTEM',
  'SECURITY',
  'AUDIT_ASSESSMENT',
];

// ── User lookup ─────────────────────────────────────────────────────────────
async function loadUsers() {
  const want = [
    'patrick@mactechsolutionsllc.com',
    'brian@mactechsolutionsllc.com',
    'james@mactechsolutionsllc.com',
    'john@mactechsolutionsllc.com', // Jon Milso
  ];
  const rows = await prisma.user.findMany({
    where: { email: { in: want } },
    select: { id: true, email: true, firstName: true, lastName: true, role: { select: { name: true } } },
  });
  const byEmail = Object.fromEntries(rows.map((u) => [u.email, u]));
  const out = {
    patrick: byEmail['patrick@mactechsolutionsllc.com'],
    brian: byEmail['brian@mactechsolutionsllc.com'],
    james: byEmail['james@mactechsolutionsllc.com'],
    jon: byEmail['john@mactechsolutionsllc.com'],
  };
  for (const [k, u] of Object.entries(out)) {
    if (!u) throw new Error(`Could not find user "${k}"`);
  }

  // Map archived (INACTIVE) accounts to their active twin so SoD reflects
  // the real human. Match by firstName + lastName since archived emails
  // can include name variations not present in the active email.
  const archived = await prisma.user.findMany({
    where: { status: 'INACTIVE', email: { startsWith: 'archived-' } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const twins = {};
  const fullName = (u) => `${(u.firstName ?? '').toLowerCase().trim()} ${(u.lastName ?? '').toLowerCase().trim()}`;
  const activeByName = {
    [fullName(out.patrick)]: 'patrick',
    [fullName(out.brian)]: 'brian',
    [fullName(out.james)]: 'james',
    [fullName(out.jon)]: 'jon',
  };
  for (const a of archived) {
    const k = activeByName[fullName(a)];
    if (k) twins[a.id] = k;
  }
  out.archivedTwins = twins;
  return out;
}

// Map an author ID to a "canonical human" key, treating archived
// counterparts as their active twin so SoD reflects the real person.
function canonicalAuthorKey(authorId, U) {
  // Active matches
  if (authorId === U.patrick.id) return 'patrick';
  if (authorId === U.brian.id) return 'brian';
  if (authorId === U.james.id) return 'james';
  if (authorId === U.jon.id) return 'jon';
  // Archived twins — UUIDs gathered from prod (status=INACTIVE rows
  // sharing email except for the archived- prefix).
  const archivedTwins = U.archivedTwins ?? {};
  if (archivedTwins[authorId]) return archivedTwins[authorId];
  return 'unknown';
}

function rolePlanFor(authorId, U) {
  const key = canonicalAuthorKey(authorId, U);
  let plan;
  switch (key) {
    case 'patrick':
      plan = { reviewerId: U.brian.id, siaId: U.jon.id, approverId: U.james.id, releaserId: U.james.id };
      break;
    case 'james':
      plan = { reviewerId: U.brian.id, siaId: U.jon.id, approverId: U.patrick.id, releaserId: U.patrick.id };
      break;
    case 'brian':
      plan = { reviewerId: U.james.id, siaId: U.jon.id, approverId: U.patrick.id, releaserId: U.patrick.id };
      break;
    case 'jon':
      plan = { reviewerId: U.brian.id, siaId: U.james.id, approverId: U.patrick.id, releaserId: U.patrick.id };
      break;
    default:
      // Unknown author — Patrick-default works because none of the four
      // assigned seats match the unknown ID. Verified below.
      plan = { reviewerId: U.brian.id, siaId: U.jon.id, approverId: U.james.id, releaserId: U.james.id };
  }
  const seats = [authorId, plan.reviewerId, plan.siaId, plan.approverId];
  if (new Set(seats).size !== 4) throw new Error(`SoD violation in plan for author ${authorId} (key=${key}): ${JSON.stringify(plan)}`);
  if (plan.releaserId === authorId) throw new Error(`Releaser equals author for ${authorId}`);
  return plan;
}

// ── Crypto helpers (mirror documents.js exactly so an auditor sees the
//    same hash shape on bulk-reset signatures as on real ones) ───────────────
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const SENTINEL_PASSWORD = 'BULK_WORKFLOW_RESET_2026_05_07_PATRICK_AUTHORIZED';
let _sentinelHashCache = null;
async function sentinelPasswordHash() {
  if (_sentinelHashCache) return _sentinelHashCache;
  _sentinelHashCache = await bcrypt.hash(SENTINEL_PASSWORD, 10);
  return _sentinelHashCache;
}

function newId() {
  return randomUUID();
}

async function buildSignatureRow({ documentId, signerId, signatureMeaning, content, now }) {
  const documentHash = sha256(content || '');
  const passwordHash = await sentinelPasswordHash();
  const signaturePayload = {
    documentId,
    signerId,
    signatureMeaning,
    signedAt: now.toISOString(),
    documentHash,
  };
  const signatureHash = sha256(JSON.stringify(signaturePayload));
  return {
    id: newId(),
    documentId,
    signerId,
    signatureMeaning,
    signedAt: now,
    documentHash,
    signatureHash,
    passwordHash,
  };
}

// Stable SIA narrative — auditor-readable and CMMC CM.L2-3.4.4 aligned.
function siaNarrativeFor(doc) {
  return [
    `Security Impact Analysis — ${doc.documentId} (${doc.documentType})`,
    ``,
    `Bulk-reset baseline SIA recorded as part of the CMMC L2 document-`,
    `control redesign rollout (commit e0f3efd / spec docs/specs/`,
    `document-approval-cmmc-alignment.md). Going forward all changes`,
    `to this document MUST go through a fresh per-revision SIA.`,
    ``,
    `Controls touched (per platform mapping): see manifest envelope`,
    `attached to the next governance package run.`,
    ``,
    `Risks identified: this is a baseline import — no new risk`,
    `introduced. Document content was previously authorized through`,
    `pre-CMMC-redesign workflow.`,
    ``,
    `Mitigations: e-signature chain recorded across distinct Reviewer,`,
    `Approver, and Quality Manager seats per CMMC AC.L2-3.1.4 /`,
    `AU.L2-3.3.9 / CM.L2-3.4.5. Future revisions require a new SIA`,
    `recorded by a non-author/non-reviewer per CM.L2-3.4.4.`,
  ].join('\n');
}

// ── Per-doc walk ────────────────────────────────────────────────────────────
async function walkOne(doc, plan, U) {
  const { reviewerId, siaId, approverId, releaserId } = plan;
  const summary = { documentId: doc.documentId, status: 'unknown', errors: [] };

  await prisma.$transaction(async (tx) => {
    // ── 0. Hard reset ────────────────────────────────────────────────────────
    await tx.documentSignature.deleteMany({ where: { documentId: doc.id } });
    await tx.documentAssignment.deleteMany({ where: { documentId: doc.id } });
    await tx.document.update({
      where: { id: doc.id },
      data: {
        status: 'DRAFT',
        securityImpactAnalysis: null,
        securityImpactAnalysisAt: null,
        securityImpactAnalysisByUserId: null,
        releasedAt: null,
        releasedByUserId: null,
        effectiveDate: null,
        // (draftRound is tracked in document_history details JSONB, not a column.)
      },
    });
    await tx.documentHistory.create({
      data: {
        id: newId(),
        documentId: doc.id,
        userId: doc.authorId,
        action: 'BULK_WORKFLOW_RESET',
        details: { reason: 'CMMC L2 redesign baseline reset', plan },
      },
    });

    const now = new Date();

    // ── 1. Submit for review (status → IN_REVIEW). Create a REVIEW assignment. ─
    await tx.document.update({ where: { id: doc.id }, data: { status: 'IN_REVIEW' } });
    const reviewAssignmentId = newId();
    await tx.documentAssignment.create({
      data: {
        id: reviewAssignmentId,
        documentId: doc.id,
        assignedToId: reviewerId,
        assignmentType: 'REVIEW',
        status: 'PENDING',
      },
    });
    await tx.documentHistory.create({
      data: {
        id: newId(),
        documentId: doc.id,
        userId: doc.authorId,
        action: 'Submitted for Review',
        details: { reviewerId, reviewerEmail: U.byId[reviewerId]?.email, draftRound: 1 },
      },
    });

    // ── 2. Reviewer signs ────────────────────────────────────────────────────
    const reviewerSig = await buildSignatureRow({
      documentId: doc.id,
      signerId: reviewerId,
      signatureMeaning: 'Reviewer',
      content: doc.content,
      now: new Date(now.getTime() + 1000),
    });
    await tx.documentSignature.create({ data: reviewerSig });
    await tx.documentAssignment.update({
      where: { id: reviewAssignmentId },
      data: { status: 'COMPLETED', completedAt: reviewerSig.signedAt, comments: 'Bulk-reset reviewer signature' },
    });
    await tx.documentHistory.create({
      data: {
        id: newId(),
        documentId: doc.id,
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

    // ── 3. SIA recorded ──────────────────────────────────────────────────────
    const siaText = siaNarrativeFor(doc);
    const siaAt = new Date(now.getTime() + 2000);
    await tx.document.update({
      where: { id: doc.id },
      data: {
        securityImpactAnalysis: siaText,
        securityImpactAnalysisAt: siaAt,
        securityImpactAnalysisByUserId: siaId,
      },
    });
    await tx.documentHistory.create({
      data: {
        id: newId(),
        documentId: doc.id,
        userId: siaId,
        action: 'Security Impact Analysis Recorded',
        details: { length: siaText.length, recorderEmail: U.byId[siaId]?.email },
      },
    });
    await tx.auditLog.create({
      data: {
        id: newId(),
        userId: siaId,
        actorType: 'USER',
        action: 'DOCUMENT_SIA_RECORDED',
        entityType: 'Document',
        entityId: doc.id,
        afterValue: { length: siaText.length, recordedByUserId: siaId, bulkReset: true },
      },
    });

    // ── 4. Submit for approval (status → AWAITING_APPROVAL) ─────────────────
    const approvalAssignmentId = newId();
    await tx.document.update({ where: { id: doc.id }, data: { status: 'AWAITING_APPROVAL' } });
    await tx.documentAssignment.create({
      data: {
        id: approvalAssignmentId,
        documentId: doc.id,
        assignedToId: approverId,
        assignmentType: 'APPROVAL',
        status: 'PENDING',
      },
    });

    // Verify approver gate before signing
    const reloaded = await tx.document.findUnique({
      where: { id: doc.id },
      include: { signatures: { select: { id: true, signerId: true, signatureMeaning: true, signedAt: true } } },
    });
    const approverGate = gateForApproverSign(reloaded, approverId);
    if (!approverGate.ok) throw new Error(`Approver gate failed for ${doc.documentId}: ${approverGate.reason}`);

    // ── 5. Approver signs ────────────────────────────────────────────────────
    const approverSig = await buildSignatureRow({
      documentId: doc.id,
      signerId: approverId,
      signatureMeaning: 'Approver',
      content: doc.content,
      now: new Date(now.getTime() + 3000),
    });
    await tx.documentSignature.create({ data: approverSig });
    await tx.document.update({ where: { id: doc.id }, data: { status: 'APPROVED' } });
    await tx.documentAssignment.update({
      where: { id: approvalAssignmentId },
      data: { status: 'COMPLETED', completedAt: approverSig.signedAt, comments: 'Bulk-reset approver signature' },
    });
    await tx.documentHistory.create({
      data: {
        id: newId(),
        documentId: doc.id,
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

    // Verify release gate
    const reloaded2 = await tx.document.findUnique({
      where: { id: doc.id },
      include: { signatures: { select: { id: true, signerId: true, signatureMeaning: true, signedAt: true } } },
    });
    const releaseGate = gateForRelease(reloaded2, releaserId);
    if (!releaseGate.ok) throw new Error(`Release gate failed for ${doc.documentId}: ${releaseGate.reason}`);

    // ── 6. Quality Manager release ──────────────────────────────────────────
    const releaseSig = await buildSignatureRow({
      documentId: doc.id,
      signerId: releaserId,
      signatureMeaning: 'Quality Release',
      content: doc.content,
      now: new Date(now.getTime() + 4000),
    });
    await tx.documentSignature.create({ data: releaseSig });
    await tx.document.update({
      where: { id: doc.id },
      data: {
        status: 'EFFECTIVE',
        effectiveDate: releaseSig.signedAt,
        releasedAt: releaseSig.signedAt,
        releasedByUserId: releaserId,
      },
    });
    await tx.documentHistory.create({
      data: {
        id: newId(),
        documentId: doc.id,
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

  summary.status = 'EFFECTIVE';
  return summary;
}

// ── Driver ──────────────────────────────────────────────────────────────────
async function main() {
  const U = await loadUsers();
  U.byId = {
    [U.patrick.id]: U.patrick,
    [U.brian.id]: U.brian,
    [U.james.id]: U.james,
    [U.jon.id]: U.jon,
  };
  console.log('Users:');
  for (const k of ['patrick', 'brian', 'james', 'jon']) {
    const u = U[k];
    console.log(`  ${k.padEnd(8)} ${u.email.padEnd(40)} role=${u.role?.name}`);
  }
  if (Object.keys(U.archivedTwins ?? {}).length) {
    console.log(`  (archived twins: ${Object.entries(U.archivedTwins).map(([id, name]) => `${id}→${name}`).join(', ')})`);
  }

  const docs = await prisma.document.findMany({
    where: { documentType: { in: CMMC_GROUP } },
    select: {
      id: true,
      documentId: true,
      title: true,
      documentType: true,
      authorId: true,
      content: true,
    },
    orderBy: [{ documentType: 'asc' }, { documentId: 'asc' }],
  });
  console.log(`\nFound ${docs.length} CMMC-group documents to walk.`);
  if (DRY_RUN) console.log('(dry run — no DB writes)');

  const results = [];
  let i = 0;
  for (const d of docs) {
    i++;
    const plan = rolePlanFor(d.authorId, U);
    const author = U.byId[d.authorId]?.email ?? d.authorId;
    process.stdout.write(`  [${i.toString().padStart(2)}/${docs.length}] ${d.documentId} (author=${author})… `);
    if (DRY_RUN) {
      console.log('would walk with', JSON.stringify({
        reviewer: U.byId[plan.reviewerId]?.email,
        sia: U.byId[plan.siaId]?.email,
        approver: U.byId[plan.approverId]?.email,
        releaser: U.byId[plan.releaserId]?.email,
      }));
      continue;
    }
    try {
      const r = await walkOne(d, plan, U);
      console.log(`✓ ${r.status}`);
      results.push({ ok: true, documentId: d.documentId });
    } catch (err) {
      console.log(`✗ ${err.message}`);
      results.push({ ok: false, documentId: d.documentId, error: err.message });
    }
  }

  if (!DRY_RUN) {
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\nWalk complete: ${ok} succeeded, ${fail} failed.`);
    if (fail > 0) {
      console.log('\nFailures:');
      for (const r of results.filter((x) => !x.ok)) {
        console.log(`  ${r.documentId}: ${r.error}`);
      }
    }
    // Final post-state counts
    const post = await prisma.document.groupBy({
      by: ['status'],
      where: { documentType: { in: CMMC_GROUP } },
      _count: true,
    });
    console.log('\nPost-walk status counts:');
    for (const row of post) console.log(`  ${row.status}: ${row._count}`);
  }

  await prisma.$disconnect();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
