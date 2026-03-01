/**
 * Set CMMC tag only on a specific allowlist of document IDs.
 * Run from server: node scripts/set-cmmc-tag-allowlist.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

const CMMC_ALLOWLIST = [
  'MAC-POL-210',
  'MAC-POL-219',
  'MAC-SOP-227',
  'MAC-POL-218',
  'MAC-SOP-226',
  'MAC-POL-220',
  'MAC-SOP-225',
  'MAC-POL-215',
  'MAC-SOP-232',
  'MAC-POL-221',
  'MAC-POL-222',
  'MAC-SOP-233',
  'MAC-POL-223',
  'MAC-POL-224',
  'MAC-CMP-001',
  'MAC-POL-211',
  'MAC-SOP-221',
  'MAC-SOP-224',
  'MAC-POL-214',
];

async function setCmmcAllowlist() {
  // 1. Remove CMMC from all documents
  const withCmmc = await prisma.document.findMany({
    where: { tags: { has: 'CMMC' } },
    select: { id: true, documentId: true, tags: true },
  });
  for (const doc of withCmmc) {
    const newTags = doc.tags.filter((t) => t !== 'CMMC');
    await prisma.document.update({
      where: { id: doc.id },
      data: { tags: newTags },
    });
  }
  console.log(`Removed CMMC from ${withCmmc.length} document(s).`);

  // 2. Add CMMC only to allowlisted documentIds
  const allowSet = new Set(CMMC_ALLOWLIST);
  const toTag = await prisma.document.findMany({
    where: { documentId: { in: CMMC_ALLOWLIST } },
    select: { id: true, documentId: true, tags: true },
  });

  for (const doc of toTag) {
    if (!(doc.tags || []).includes('CMMC')) {
      const newTags = [...(doc.tags || []), 'CMMC'];
      await prisma.document.update({
        where: { id: doc.id },
        data: { tags: newTags },
      });
      console.log(`  ${doc.documentId}: tags now [${newTags.join(', ')}]`);
    }
  }

  const notFound = CMMC_ALLOWLIST.filter((id) => !toTag.some((d) => d.documentId === id));
  if (notFound.length) {
    console.log('Not found in DB (no change):', notFound.join(', '));
  }
  console.log(`Done. CMMC tag set on ${toTag.length} document(s) only.`);
}

setCmmcAllowlist()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
