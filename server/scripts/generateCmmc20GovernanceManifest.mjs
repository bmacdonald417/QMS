#!/usr/bin/env node
/**
 * Generate governance-manifest.json for all QMS documents tagged CMMC-2.0.
 *
 * Usage (from server/): node scripts/generateCmmc20GovernanceManifest.mjs
 *   CMMC_TAG=CMMC-2.0  (default)
 *   OUT=../governance-manifest-cmmc20.json  (default: ../governance-manifest-cmmc20.json from repo root)
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/db.js';
import { buildQmsGovernanceManifestFromDocumentIds } from '../src/lib/buildQmsGovernanceManifest.js';

const CMMC_TAG = process.env.CMMC_TAG || 'CMMC-2.0';
const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultOut = resolve(__dirname, '../../governance-manifest-cmmc20.json');
const outPath = process.env.OUT ? resolve(process.env.OUT) : defaultOut;
const generatedBy = process.env.TRUST_CODEX_USER || process.env.GENERATED_BY || 'qms-cli';

async function main() {
  const rows = await prisma.document.findMany({
    where: { tags: { has: CMMC_TAG } },
    select: { id: true, documentId: true },
    orderBy: { documentId: 'asc' },
  });

  const ids = rows.map((r) => r.id);
  console.log(`Found ${ids.length} document(s) with tag "${CMMC_TAG}".`);

  if (!ids.length) {
    console.error('No documents to export. Tag documents with', CMMC_TAG, 'in Document Control.');
    process.exit(1);
  }

  const { manifest, warnings } = await buildQmsGovernanceManifestFromDocumentIds(ids, {
    generatedBy,
    source: 'qms_document_control_cmmc20',
    toolVersion: '1.0.0-qms-cmmc20',
  });

  if (!manifest) {
    console.error('Manifest build failed.', warnings);
    process.exit(1);
  }

  manifest.tag_filter = CMMC_TAG;
  manifest.summary.document_ids_included = ids.length;

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(outPath, json, { encoding: 'utf8' });

  console.log(`Wrote: ${outPath}`);
  console.log(`run_id: ${manifest.run_id}`);
  console.log(`documents: ${manifest.summary.total_documents}`);
  if (warnings?.length) {
    console.warn('Warnings:', warnings);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
