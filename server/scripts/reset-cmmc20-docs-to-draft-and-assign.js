/**
 * Reset all documents tagged CMMC-2.0 to draft with no signatures or in-review status.
 * Assign Brian as Reviewer and James as Approver for each.
 * Notify Brian that he has been assigned N documents for review.
 *
 * Run from server: node scripts/reset-cmmc20-docs-to-draft-and-assign.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

// Use DATABASE_PUBLIC_URL for local development (e.g. connecting to Railway from outside)
if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL?.includes('railway.internal')) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const prisma = new PrismaClient();

const CMMC_TAG = 'CMMC-2.0';

async function createNotifications(userIds, message, link) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, message, link })),
  });
}

async function run() {
  const brian = await prisma.user.findFirst({
    where: { firstName: { equals: 'Brian', mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });
  const james = await prisma.user.findFirst({
    where: { firstName: { equals: 'James', mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!brian) {
    console.error('User "Brian" not found. Create the user or adjust the script.');
    process.exit(1);
  }
  if (!james) {
    console.error('User "James" not found. Create the user or adjust the script.');
    process.exit(1);
  }

  console.log(`Reviewer: ${brian.firstName} ${brian.lastName} (${brian.id})`);
  console.log(`Approver: ${james.firstName} ${james.lastName} (${james.id})`);

  const documents = await prisma.document.findMany({
    where: { tags: { has: CMMC_TAG } },
    select: { id: true, documentId: true, title: true, status: true },
  });

  console.log(`Found ${documents.length} document(s) tagged ${CMMC_TAG}.`);

  if (documents.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const doc of documents) {
    await prisma.$transaction(async (tx) => {
      await tx.documentSignature.deleteMany({ where: { documentId: doc.id } });
      await tx.documentAssignment.deleteMany({ where: { documentId: doc.id } });
      await tx.document.update({
        where: { id: doc.id },
        data: {
          status: 'DRAFT',
          isUnderReview: false,
        },
      });
      await tx.documentAssignment.createMany({
        data: [
          {
            documentId: doc.id,
            assignedToId: brian.id,
            assignmentType: 'REVIEW',
            status: 'PENDING',
          },
          {
            documentId: doc.id,
            assignedToId: james.id,
            assignmentType: 'APPROVAL',
            status: 'PENDING',
          },
        ],
      });
    });
    console.log(`  ${doc.documentId}: reset to DRAFT, assigned Reviewer (Brian) & Approver (James).`);
  }

  const count = documents.length;
  await createNotifications(
    [brian.id],
    `You have been assigned ${count} document${count === 1 ? '' : 's'} for review.`,
    '/documents'
  );
  console.log(`Notification sent to Brian: assigned ${count} documents for review.`);
  console.log('Done.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
