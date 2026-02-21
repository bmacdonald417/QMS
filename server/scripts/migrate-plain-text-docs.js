/**
 * Migrate plain-text document content to HTML paragraphs.
 * Run from server: npm run db:migrate-plain-text
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function migrateDocuments() {
  console.log('Starting migration of plain-text document content...');

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        { content: { not: null } },
        { NOT: { content: { startsWith: '<' } } },
      ],
    },
  });

  if (documents.length === 0) {
    console.log('No plain-text documents found to migrate. Database is clean.');
    return;
  }

  console.log(`Found ${documents.length} documents to migrate.`);
  let migratedCount = 0;

  for (const doc of documents) {
    if (doc.content && doc.content.trim().length > 0) {
      console.log(`Migrating document ID: ${doc.id} (${doc.documentId})...`);
      const newContent = doc.content
        .split('\n')
        .map((line) => {
          const escaped = escapeHtml(line.trim());
          return `<p>${escaped || '&nbsp;'}</p>`;
        })
        .join('');

      await prisma.document.update({
        where: { id: doc.id },
        data: { content: newContent },
      });
      migratedCount++;
    }
  }

  console.log(`Migration complete. Migrated ${migratedCount} documents.`);
}

migrateDocuments()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
