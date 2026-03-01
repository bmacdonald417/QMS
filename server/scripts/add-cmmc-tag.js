/**
 * Add the "CMMC" tag to all documents that don't already have it.
 * Run from server: node scripts/add-cmmc-tag.js
 * Or: npm run db:add-cmmc-tag (with DATABASE_URL or DATABASE_PUBLIC_URL set)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function addCmmcTag() {
  const docs = await prisma.document.findMany({
    select: { id: true, documentId: true, tags: true },
  });

  const toUpdate = docs.filter((doc) => !(doc.tags || []).includes('CMMC'));

  if (toUpdate.length === 0) {
    console.log('All documents already have the CMMC tag.');
    return;
  }

  console.log(`Adding CMMC tag to ${toUpdate.length} document(s)...`);

  for (const doc of toUpdate) {
    const currentTags = doc.tags || [];
    const newTags = [...currentTags, 'CMMC'];
    await prisma.document.update({
      where: { id: doc.id },
      data: { tags: newTags },
    });
    console.log(`  ${doc.documentId}: tags now [${newTags.join(', ')}]`);
  }

  console.log('Done. CMMC tag added to all documents.');
}

addCmmcTag()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
