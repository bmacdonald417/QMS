#!/usr/bin/env node
/**
 * Remove all documents and all related rows (links, comments, revisions, etc.)
 * so you can do a fresh import.
 *
 * Usage: node scripts/wipe-all-documents.js
 * Requires: DATABASE_URL
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prisma } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

async function run() {
  const count = await prisma.document.count();
  if (count === 0) {
    console.log('No documents in the database.');
    await prisma.$disconnect();
    return;
  }

  console.log('Removing', count, 'documents and all related data...');

  await prisma.$transaction(async (tx) => {
    await tx.documentLink.deleteMany({});
    await tx.documentComment.deleteMany({});
    await tx.documentSignature.deleteMany({});
    await tx.documentRevision.deleteMany({});
    await tx.documentHistory.deleteMany({});
    await tx.documentAssignment.deleteMany({});
    const modules = await tx.trainingModule.findMany({ select: { id: true } });
    const moduleIds = modules.map((m) => m.id);
    if (moduleIds.length) await tx.userTrainingRecord.deleteMany({ where: { trainingModuleId: { in: moduleIds } } });
    await tx.trainingModule.deleteMany({});
    await tx.periodicReview.deleteMany({});
    await tx.document.deleteMany({});
  });

  console.log('Done. All documents removed.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
