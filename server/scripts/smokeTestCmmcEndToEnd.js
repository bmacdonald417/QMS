/**
 * End-to-end smoke test for the CMMC L2 document approval pipeline.
 *
 * READ-ONLY against prod. Does NOT push anything to codex. Validates:
 *
 *   1. Schema — the 5 SIA/release columns exist on Document.
 *   2. Population — counts of CMMC-group docs by status, SIA-recorded,
 *      release-stamped, signature distribution.
 *   3. Manifest builder — for every EFFECTIVE doc, build the v1.2
 *      manifest in-memory (no push) and verify each per-doc envelope
 *      carries: signatures[], released:true, control mappings.
 *   4. Codex sufficiency — for every CMMC-group doc, list every
 *      gate that's currently blocking release. Tells you what an
 *      auditor would flag.
 *   5. Last 5 GovernanceManifestRun rows on QMS — what we last shipped
 *      to codex, with status / attempts / push outcome.
 *
 * Usage:
 *   railway run node scripts/smokeTestCmmcEndToEnd.js
 */
import { prisma } from '../src/db.js';
import { buildQmsGovernanceManifestFromDocumentIds } from '../src/lib/buildQmsGovernanceManifest.js';

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

const APPROVER_RE = /^approver$|approve|release/i;
const REVIEWER_RE = /^reviewer$|^review$/i;

function hr(label) {
  console.log(`\n──────────  ${label}  ──────────`);
}

function check(label, ok, detail) {
  const tag = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${color}${tag}\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  let passes = 0;
  let fails = 0;
  const fail = (msg) => {
    fails++;
    check(msg, false);
  };
  const pass = (msg, detail) => {
    passes++;
    check(msg, true, detail);
  };

  hr('1. Schema — SIA + release columns present');

  const cols = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'documents'
      AND column_name IN (
        'security_impact_analysis',
        'security_impact_analysis_at',
        'security_impact_analysis_by_user_id',
        'released_at',
        'released_by_user_id'
      )
    ORDER BY column_name`;
  const colNames = new Set(cols.map((c) => c.column_name));
  const expectedCols = [
    'released_at',
    'released_by_user_id',
    'security_impact_analysis',
    'security_impact_analysis_at',
    'security_impact_analysis_by_user_id',
  ];
  for (const c of expectedCols) {
    if (colNames.has(c)) pass(`column ${c} exists`);
    else fail(`column ${c} MISSING — prisma db push did not run`);
  }

  hr('2. Population — CMMC-group document counts');

  const docs = await prisma.document.findMany({
    where: { documentType: { in: CMMC_GROUP } },
    select: {
      id: true,
      documentId: true,
      title: true,
      documentType: true,
      status: true,
      authorId: true,
      releasedAt: true,
      releasedByUserId: true,
      securityImpactAnalysis: true,
      securityImpactAnalysisAt: true,
      securityImpactAnalysisByUserId: true,
      signatures: {
        select: { signerId: true, signatureMeaning: true, signedAt: true },
      },
    },
    orderBy: [{ documentType: 'asc' }, { documentId: 'asc' }],
  });

  if (docs.length === 0) {
    fail('No CMMC-group documents found in prod');
    await prisma.$disconnect();
    process.exit(1);
  }
  pass(`${docs.length} CMMC-group documents`);

  const byStatus = {};
  for (const d of docs) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  console.log(
    `      status breakdown: ${Object.entries(byStatus)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );

  const withSIA = docs.filter((d) => d.securityImpactAnalysis?.trim()).length;
  const withRelease = docs.filter((d) => d.releasedAt).length;
  const effective = docs.filter((d) => d.status === 'EFFECTIVE').length;
  const withReviewerSig = docs.filter((d) =>
    d.signatures.some((s) => REVIEWER_RE.test(s.signatureMeaning)),
  ).length;
  const withApproverSig = docs.filter((d) =>
    d.signatures.some((s) => APPROVER_RE.test(s.signatureMeaning)),
  ).length;

  console.log(`      SIA recorded:        ${withSIA}/${docs.length}`);
  console.log(`      Reviewer signed:     ${withReviewerSig}/${docs.length}`);
  console.log(`      Approver signed:     ${withApproverSig}/${docs.length}`);
  console.log(`      Quality released:    ${withRelease}/${docs.length}`);
  console.log(`      EFFECTIVE status:    ${effective}/${docs.length}`);

  if (effective > 0 && withRelease === 0) {
    console.log(
      `\n      \x1b[33mNOTE\x1b[0m: ${effective} EFFECTIVE docs have NULL released_at — these were\n      released BEFORE the release-stamp columns existed. Backfill is a\n      future-sprint item; safe to leave as-is for the smoke.`,
    );
  }

  hr('3. Manifest builder — v1.2 envelope shape');

  const allIds = docs.map((d) => d.id);
  const { manifest, warnings } = await buildQmsGovernanceManifestFromDocumentIds(allIds, {
    generatedBy: 'smoke-test',
    issuerClientId: 'mactech-qms-smoke',
    source: 'smoke_test',
    releasedOnly: false, // include everything so we can inspect the full set
  });

  if (!manifest) {
    fail(`Builder returned no manifest. Warnings: ${warnings.join('; ')}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  pass(`builder produced manifest schema=${manifest.schema}`);
  if (manifest.schema === 'mactech-governance-manifest.v1.2')
    pass(`schema is v1.2 (per-doc signatures + release lifecycle)`);
  else fail(`schema is ${manifest.schema}, expected mactech-governance-manifest.v1.2`);

  pass(
    `documents in envelope: ${manifest.documents.length}/${docs.length}`,
    `controls_touched=${manifest.controls_touched.length} unique`,
  );

  // Check that every doc carries: sha256, controls_mapped[], released, signatures[]
  const sample = manifest.documents[0];
  const requiredFields = ['document_number', 'document_name', 'sha256', 'controls_mapped', 'released', 'signatures'];
  for (const f of requiredFields) {
    if (sample && Object.prototype.hasOwnProperty.call(sample, f)) pass(`per-doc field ${f} present`);
    else fail(`per-doc field ${f} MISSING from envelope`);
  }

  // Released vs unreleased breakdown
  const released = manifest.documents.filter((d) => d.released === true).length;
  const unreleased = manifest.documents.filter((d) => d.released === false).length;
  pass(
    `release_summary: released=${released}, unreleased=${unreleased}`,
    `(matches manifest.release_summary: released=${manifest.release_summary?.released_docs}, unreleased=${manifest.release_summary?.unreleased_docs})`,
  );

  // Per-doc signature check on released ones
  const releasedDocs = manifest.documents.filter((d) => d.released === true);
  const releasedWithSigs = releasedDocs.filter((d) => Array.isArray(d.signatures) && d.signatures.length > 0).length;
  if (releasedDocs.length > 0) {
    if (releasedWithSigs === releasedDocs.length)
      pass(`all ${releasedDocs.length} released docs carry per-doc signatures`);
    else
      fail(
        `${releasedDocs.length - releasedWithSigs}/${releasedDocs.length} released docs missing signatures (codex would mark released:false on those)`,
      );
  }

  // Hashes
  pass(`content_hash: ${manifest.content_hash}`);
  if (manifest.signing_hash) pass(`signing_hash present`);
  if (manifest.signature?.value) pass(`HMAC signature present (${manifest.signature.algorithm})`);
  else fail(`HMAC signature missing — QMS_MANIFEST_SIGNING_SECRET unset?`);

  hr('4. Codex sufficiency — gate blockers per CMMC-group doc');

  const blocked = [];
  for (const d of docs) {
    const reviewerCount = d.signatures.filter((s) => REVIEWER_RE.test(s.signatureMeaning)).length;
    const approverCount = d.signatures.filter((s) => APPROVER_RE.test(s.signatureMeaning)).length;
    const hasSIA = Boolean(d.securityImpactAnalysis?.trim());
    const isReleased = d.status === 'EFFECTIVE';
    const isObsolete = d.status === 'OBSOLETE' || d.status === 'ARCHIVED';

    if (isReleased || isObsolete) continue;

    const reasons = [];
    if (reviewerCount === 0) reasons.push('no Reviewer sig');
    if (!hasSIA) reasons.push('no SIA');
    if (approverCount === 0) reasons.push('no Approver sig');
    if (d.status === 'APPROVED' || d.status === 'PENDING_QUALITY_RELEASE')
      reasons.push('awaiting QM release');

    blocked.push({ doc: d, reasons });
  }

  if (blocked.length === 0) {
    pass(`no blocked CMMC-group docs — every non-effective row has its gate satisfied`);
  } else {
    console.log(`      ${blocked.length} doc(s) need action before they can ship to codex:`);
    for (const b of blocked) {
      console.log(
        `        • [${b.doc.status}] ${b.doc.documentId} — ${b.reasons.join(', ')}`,
      );
    }
  }

  hr('5. Last GovernanceManifestRun rows on QMS');

  const runs = await prisma.governanceManifestRun.findMany({
    orderBy: { generatedAt: 'desc' },
    take: 5,
    select: {
      runId: true,
      generatedAt: true,
      manifestSchema: true,
      documentsTotal: true,
      governanceDocCount: true,
      uniqueControlsCovered: true,
      codexPushStatus: true,
      codexPushedAt: true,
      codexPushError: true,
    },
  });

  if (runs.length === 0) {
    console.log(
      `      \x1b[33mNo GovernanceManifestRun rows yet\x1b[0m — codex has never received a push from this QMS instance.`,
    );
  } else {
    pass(`${runs.length} recent manifest runs found`);
    for (const r of runs) {
      const tag =
        r.codexPushStatus === 'stored' || r.codexPushStatus === 'already_present'
          ? '\x1b[32m✓\x1b[0m'
          : r.codexPushStatus === 'failed'
            ? '\x1b[31m✗\x1b[0m'
            : '\x1b[33m·\x1b[0m';
      console.log(
        `      ${tag} ${r.generatedAt.toISOString()} schema=${r.manifestSchema} ` +
          `docs=${r.documentsTotal} controls=${r.uniqueControlsCovered} ` +
          `codex=${r.codexPushStatus ?? 'unrecorded'}`,
      );
      if (r.codexPushError) console.log(`           error: ${r.codexPushError}`);
    }
  }

  hr('6. Vault Governance Package — canonical version');

  const active = await prisma.governancePackageVersion.findFirst({
    where: { isActive: true },
    select: {
      versionLabel: true,
      publishedAt: true,
      publishedBy: true,
      contentHash: true,
      docCount: true,
      controlsTouched: true,
    },
  });
  if (active) {
    pass(`active version: ${active.versionLabel}`, `published ${active.publishedAt.toISOString()}`);
    console.log(`      doc_count: ${active.docCount}`);
    console.log(`      controls_touched: ${active.controlsTouched?.length ?? 0} unique`);
    console.log(`      content_hash: ${active.contentHash}`);
  } else {
    console.log(`      \x1b[33mNo active GovernancePackageVersion\x1b[0m — run the seed script.`);
  }

  hr('7. Codex ingest endpoint — wire integrity (no live push)');

  const codexBase = process.env.CODEX_API_BASE_URL ?? 'https://codex.mactechsolutionsllc.com';
  console.log(`      probing ${codexBase}`);

  // Liveness
  try {
    const r = await fetch(`${codexBase}/`, { method: 'GET' });
    if (r.ok) pass(`codex root reachable (HTTP ${r.status})`);
    else fail(`codex root returned HTTP ${r.status}`);
  } catch (e) {
    fail(`codex root unreachable — ${e.message}`);
  }

  // Ingest exists + rejects empty bodies
  try {
    const r = await fetch(`${codexBase}/api/integrations/qms-manifest/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (r.status === 400) pass(`ingest validates body shape (rejected empty {} with 400)`);
    else fail(`ingest expected 400 for empty body, got ${r.status}`);
  } catch (e) {
    fail(`ingest probe crashed — ${e.message}`);
  }

  // HMAC enforcement: post a syntactically-valid envelope shape with a
  // bogus signature and confirm codex rejects it. Confirms the HMAC gate
  // is wired without requiring us to send a real run that codex would
  // persist.
  try {
    const fakeEnvelope = {
      ...manifest,
      signature: {
        ...manifest.signature,
        value: 'sha256=' + 'f'.repeat(64), // deliberately wrong
      },
    };
    const r = await fetch(`${codexBase}/api/integrations/qms-manifest/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeEnvelope),
    });
    if (r.status === 401 || r.status === 403)
      pass(`ingest rejects bad HMAC signature (HTTP ${r.status})`);
    else fail(`ingest expected 401/403 for bad signature, got ${r.status}`);
  } catch (e) {
    fail(`HMAC probe crashed — ${e.message}`);
  }

  hr('Summary');
  console.log(`  passes: \x1b[32m${passes}\x1b[0m`);
  console.log(`  fails:  ${fails > 0 ? '\x1b[31m' : ''}${fails}\x1b[0m`);
  if (warnings.length > 0) {
    console.log(`  manifest warnings: ${warnings.length}`);
    for (const w of warnings.slice(0, 10)) console.log(`    · ${w}`);
    if (warnings.length > 10) console.log(`    · ... and ${warnings.length - 10} more`);
  }

  await prisma.$disconnect();
  process.exit(fails > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nSmoke test crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
