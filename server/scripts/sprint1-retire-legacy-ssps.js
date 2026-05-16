/**
 * Sprint 1 — SSP consolidation.
 *
 * Mark all legacy SSP variants as OBSOLETE, leaving SSP-024 as the sole
 * canonical System Security Plan for MacTech CUI Vault.
 *
 * Docs retired:
 *   SSP-001, SSP-017, SSP-023, SSP-025, SSP-099,
 *   MAC-IT-304, MAC-IT-307
 *
 * Run:
 *   node scripts/sprint1-retire-legacy-ssps.js [--dry-run]
 *   (from the /server directory)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

// Use public URL when running locally
if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL?.includes('railway.internal')) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const RETIRE_IDS = [
  'SSP-001',
  'SSP-017',
  'SSP-023',
  'SSP-025',
  'SSP-099',
  'MAC-IT-304',
  'MAC-IT-307',
];

const RETIRE_REASON =
  'Superseded by SSP-024 (System Security Plan — MacTech CUI Vault), ' +
  'designated canonical SSP for CMMC L2 MacTech CUI Vault boundary per ' +
  'Patrick (2026-05-16). All future revisions go through SSP-024.';

async function main() {
  console.log('Sprint 1 — SSP consolidation');
  console.log(`Retiring ${RETIRE_IDS.length} legacy SSP docs → OBSOLETE`);
  if (DRY_RUN) console.log('(dry run — no DB writes)\n');

  // Verify SSP-024 exists (raw to avoid SSP enum deserialization error)
  const [canonical] = await prisma.$queryRaw`
    SELECT id::text, doc_id AS "documentId", status::text, title
    FROM documents WHERE doc_id LIKE 'SSP-024%' LIMIT 1
  `;
  if (!canonical) {
    console.error('ERROR: SSP-024 not found in QMS — aborting.');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`Canonical SSP: ${canonical.documentId} — "${canonical.title}" [${canonical.status}]\n`);
  if (canonical.status !== 'EFFECTIVE') {
    console.warn(`WARNING: SSP-024 is not EFFECTIVE (status=${canonical.status}). Proceeding anyway.`);
  }

  const patrick = await prisma.user.findFirst({
    where: { email: 'patrick@mactechsolutionsllc.com' },
    select: { id: true },
  });
  if (!patrick) {
    console.error('ERROR: patrick@mactechsolutionsllc.com not found.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const results = [];
  for (const docId of RETIRE_IDS) {
    const [doc] = await prisma.$queryRawUnsafe(
      `SELECT id::text, doc_id AS "documentId", status::text, title FROM documents WHERE doc_id LIKE $1 || '%' LIMIT 1`,
      docId,
    );
    if (!doc) {
      console.log(`  SKIP  ${docId.padEnd(12)} — not found in QMS`);
      results.push({ docId, outcome: 'not_found' });
      continue;
    }
    if (doc.status === 'OBSOLETE') {
      console.log(`  SKIP  ${doc.documentId.padEnd(20)} — already OBSOLETE`);
      results.push({ docId: doc.documentId, outcome: 'already_obsolete' });
      continue;
    }
    if (DRY_RUN) {
      console.log(`  WOULD retire  ${doc.documentId.padEnd(20)} [${doc.status}] "${doc.title}"`);
      results.push({ docId: doc.documentId, outcome: 'dry_run' });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id: doc.id }, data: { status: 'OBSOLETE' }, select: { id: true } });
      await tx.documentHistory.create({
        data: {
          id: randomUUID(),
          documentId: doc.id,
          userId: patrick.id,
          action: 'Status Changed to OBSOLETE',
          details: { previousStatus: doc.status, reason: RETIRE_REASON, sprint: 'sprint1-ssp-consolidation' },
        },
      });
    });

    console.log(`  RETIRED  ${doc.documentId.padEnd(20)} [${doc.status} → OBSOLETE] "${doc.title}"`);
    results.push({ docId: doc.documentId, outcome: 'retired', from: doc.status });
  }

  const retired = results.filter((r) => r.outcome === 'retired').length;
  const skipped = results.filter((r) => ['not_found', 'already_obsolete'].includes(r.outcome)).length;
  console.log(`\nDone. Retired: ${retired}  Skipped: ${skipped}`);

  if (!DRY_RUN) {
    const ssps = await prisma.$queryRaw`
      SELECT doc_id AS "documentId", status::text, title
      FROM documents WHERE doc_type = 'SSP'
      ORDER BY doc_id ASC
    `;
    console.log(`\nAll SSP docs post-run:`);
    for (const s of ssps) {
      const marker = s.documentId.startsWith('SSP-024') ? ' ← CANONICAL' : '';
      console.log(`  [${s.status}] ${s.documentId.padEnd(20)} "${s.title}"${marker}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
