/**
 * One-shot bulk push of every EFFECTIVE CMMC-group document to codex.
 *
 * Builds a single v1.2 envelope covering all 54 docs (each with full
 * per-doc signature chain + released:true + control mappings), signs
 * it with QMS_MANIFEST_SIGNING_SECRET, and POSTs to codex's
 * /api/integrations/qms-manifest/ingest. Records a
 * GovernanceManifestRun row (the same audit trail the in-app
 * /push-to-codex endpoint writes).
 *
 *   railway run node scripts/bulkPushToCodex.js
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';
import { buildQmsGovernanceManifestFromDocumentIds } from '../src/lib/buildQmsGovernanceManifest.js';
import { pushManifestToCodex } from '../src/lib/codexManifestClient.js';

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

async function main() {
  const docs = await prisma.document.findMany({
    where: {
      documentType: { in: CMMC_GROUP },
      status: 'EFFECTIVE',
    },
    select: { id: true, documentId: true },
    orderBy: { documentId: 'asc' },
  });
  console.log(`Loading ${docs.length} EFFECTIVE CMMC-group documents…`);
  if (docs.length === 0) {
    console.error('No EFFECTIVE docs to push.');
    process.exit(1);
  }

  const { manifest, warnings } = await buildQmsGovernanceManifestFromDocumentIds(
    docs.map((d) => d.id),
    {
      generatedBy: 'bulk-push-cli',
      releasedOnly: true,
    },
  );
  if (!manifest) {
    console.error('Failed to build manifest:', warnings);
    process.exit(1);
  }
  if (!manifest.signature?.value) {
    console.error('Manifest is unsigned — QMS_MANIFEST_SIGNING_SECRET not set');
    process.exit(1);
  }

  console.log(`Built v1.2 envelope:`);
  console.log(`  schema:           ${manifest.schema}`);
  console.log(`  run_id:           ${manifest.run_id}`);
  console.log(`  doc_count:        ${manifest.documents.length}`);
  console.log(`  controls_touched: ${manifest.controls_touched.length}`);
  console.log(`  released:         ${manifest.release_summary?.released_docs ?? 'n/a'}`);
  console.log(`  unreleased:       ${manifest.release_summary?.unreleased_docs ?? 'n/a'}`);
  console.log(`  content_hash:     ${manifest.content_hash}`);
  console.log(`  signing_hash:     ${manifest.signing_hash}`);
  console.log(`  signature.kid:    ${manifest.signature.kid}`);
  if (warnings.length) console.log(`  warnings:         ${warnings.length}`);

  // Record the run BEFORE shipping (matches /push-to-codex semantics —
  // failed pushes still leave an auditable trail).
  const runDbId = randomUUID();
  await prisma.governanceManifestRun.create({
    data: {
      id: runDbId,
      runId: manifest.run_id,
      manifestSchema: manifest.schema,
      generatedAt: new Date(manifest.generated_at),
      generatedBy: manifest.generated_by ?? null,
      toolVersion: manifest.tool_version ?? null,
      basePath: manifest.base_path ?? null,
      documentsTotal: manifest.documents.length,
      governanceDocCount: manifest.summary?.governance_documents ?? 0,
      supportingDocCount: manifest.summary?.supporting_documents ?? 0,
      uniqueControlsCovered: manifest.controls_touched.length,
      reviewOverdue: [],
      ingestLog: { warnings: warnings ?? [], source: 'bulk-push-cli' },
      contentHash: manifest.content_hash,
      signingHash: manifest.signing_hash,
      signatureKid: manifest.signature.kid,
    },
  });

  console.log('\nShipping to codex…');
  const push = await pushManifestToCodex(manifest);
  console.log('Push result:', JSON.stringify(push, null, 2));

  await prisma.governanceManifestRun.update({
    where: { id: runDbId },
    data: {
      codexPushedAt: new Date(),
      codexPushStatus: push.status,
      codexPushError: push.error ?? null,
    },
  });

  await prisma.$disconnect();
  process.exit(push.status === 'failed' ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
