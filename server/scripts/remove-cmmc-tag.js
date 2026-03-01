/**
 * Remove the "CMMC" tag from all documents.
 * Run from server: node scripts/remove-cmmc-tag.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function removeCmmcTag() {
  const docs = await prisma.document.findMany({
    where: { tags: { has: 'CMMC' } },
    select: { id: true, documentId: true, tags: true },
  });

  if (docs.length === 0) {
    console.log('No documents have the CMMC tag.');
    return;
  }

  console.log(`Found ${docs.length} document(s) with CMMC tag. Removing...`);

  for (const doc of docs) {
    const newTags = doc.tags.filter((t) => t !== 'CMMC');
    await prisma.document.update({
      where: { id: doc.id },
      data: { tags: newTags },
    });
    console.log(`  ${doc.documentId}: tags now [${newTags.join(', ') || '(none)'}]`);
  }

  console.log('Done. CMMC tag removed from all documents.');
}

removeCmmcTag()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
