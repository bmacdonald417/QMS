/**
 * Submit all CMMC-2.0 documents for review: set status to IN_REVIEW
 * so they appear in Brian's review queue (assignments already exist from reset script).
 *
 * Run from server: node scripts/submit-cmmc20-for-review.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL?.includes('railway.internal')) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const prisma = new PrismaClient();

const CMMC_TAG = 'CMMC-2.0';

async function run() {
  const documents = await prisma.document.findMany({
    where: { tags: { has: CMMC_TAG }, status: 'DRAFT' },
    select: { id: true, documentId: true, authorId: true },
  });

  console.log(`Found ${documents.length} CMMC-2.0 document(s) in DRAFT.`);

  if (documents.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const doc of documents) {
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: doc.id },
        data: { status: 'IN_REVIEW' },
      });
      await tx.documentHistory.create({
        data: {
          documentId: doc.id,
          userId: doc.authorId,
          action: 'Submitted for Review',
          details: { script: 'submit-cmmc20-for-review.js' },
        },
      });
    });
    console.log(`  ${doc.documentId}: IN_REVIEW`);
  }

  console.log('Done. Documents are in review and in Brian\'s queue.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
