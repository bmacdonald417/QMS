/**
 * Add new DocumentType enum values to the database.
 * Run: node scripts/add-document-types-enum.js
 * Safe to run multiple times - skips values that already exist.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEW_TYPES = [
  'IT_SYSTEM',
  'SECURITY',
  'AUDIT_ASSESSMENT',
  'INCIDENT_RESPONSE_PLAN',
  'CONFIGURATION_MANAGEMENT_PLAN',
];

async function main() {
  for (const type of NEW_TYPES) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "DocumentType" ADD VALUE '${type}'`
      );
      console.log(`Added DocumentType: ${type}`);
    } catch (e) {
      if (e.message?.includes('already exists') || e.code === '42710') {
        console.log(`DocumentType ${type} already exists, skipping`);
      } else {
        throw e;
      }
    }
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
