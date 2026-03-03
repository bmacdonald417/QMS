#!/usr/bin/env node
/**
 * Sync "Related Documents" from each document's content into the Where Used section
 * (DocumentLink with linkType "references").
 *
 * Parses content for a "Related Documents" (or "X. Related Documents") section and
 * extracts document IDs (e.g. MAC-SOP-221, MAC-SEC-108). Creates a document link
 * from the current document to each referenced document (by documentId, latest version).
 *
 * Usage: node scripts/syncRelatedDocumentsToLinks.js [--dry-run]
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prisma } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const DRY_RUN = process.argv.includes('--dry-run');

/** Match document IDs like MAC-SOP-221, MAC-SEC-108, MAC-IT-304, MAC-AUD-405 */
const DOC_ID_REGEX = /MAC-[A-Z]+-\d+/gi;

/**
 * Extract the "Related Documents" section from HTML or plain text content.
 * Returns the substring that contains the list of related docs (or full content if section not found).
 */
function extractRelatedDocumentsSection(content) {
  if (!content || typeof content !== 'string') return '';
  const raw = content.trim();
  if (!raw) return '';

  // Look for "Related Documents" heading (e.g. "10. Related Documents" or in <h2>)
  const relatedMatch = raw.match(
    /(?:\d+\.\s*)?Related\s+Documents[\s:<]/i
  );
  if (!relatedMatch) return '';

  const startIdx = raw.indexOf(relatedMatch[0]);
  let section = raw.slice(startIdx);

  // If HTML, optionally stop at next same-level heading to avoid pulling in later sections
  const nextH2 = section.match(/<h[12][^>]*>/i);
  if (nextH2 && nextH2.index > 100) {
    section = section.slice(0, nextH2.index);
  }

  return section;
}

/**
 * Extract unique document IDs (MAC-XXX-NNN) from a string.
 */
function extractDocumentIds(text) {
  const ids = new Set();
  let m;
  const re = new RegExp(DOC_ID_REGEX.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    ids.add(m[0].toUpperCase());
  }
  return [...ids];
}

async function run() {
  const documents = await prisma.document.findMany({
    where: { content: { not: null } },
    select: { id: true, documentId: true, title: true, content: true },
  });

  // Build map: documentId -> document row (latest version by major/minor)
  const byDocumentId = new Map();
  const allVersions = await prisma.document.findMany({
    select: { id: true, documentId: true, versionMajor: true, versionMinor: true },
    orderBy: [{ documentId: 'asc' }, { versionMajor: 'desc' }, { versionMinor: 'desc' }],
  });
  for (const d of allVersions) {
    const key = (d.documentId || '').toUpperCase();
    if (!byDocumentId.has(key)) byDocumentId.set(key, d);
  }

  let linksCreated = 0;
  let linksSkipped = 0;
  let docsProcessed = 0;
  const errors = [];

  for (const doc of documents) {
    const section = extractRelatedDocumentsSection(doc.content);
    if (!section) continue;

    const refIds = extractDocumentIds(section);
    if (refIds.length === 0) continue;

    const sourceDocIdUpper = (doc.documentId || '').toUpperCase();

    for (const refId of refIds) {
      if (refId === sourceDocIdUpper) continue; // don't link to self

      const targetDoc = byDocumentId.get(refId);
      if (!targetDoc) {
        errors.push({ source: doc.documentId, refId, error: 'Target document not found' });
        continue;
      }

      const existing = await prisma.documentLink.findFirst({
        where: {
          sourceDocumentId: doc.id,
          targetDocumentId: targetDoc.id,
          linkType: 'references',
        },
      });
      if (existing) {
        linksSkipped++;
        continue;
      }

      if (!DRY_RUN) {
        try {
          await prisma.documentLink.create({
            data: {
              sourceDocumentId: doc.id,
              targetDocumentId: targetDoc.id,
              linkType: 'references',
            },
          });
          linksCreated++;
          console.log(`Link: ${doc.documentId} → ${refId} (${targetDoc.id})`);
        } catch (e) {
          errors.push({ source: doc.documentId, refId, error: e.message });
        }
      } else {
        console.log(`[dry-run] Would link: ${doc.documentId} → ${refId}`);
        linksCreated++;
      }
    }
    docsProcessed++;
  }

  console.log(
    `\nDone. Documents with Related Documents processed: ${docsProcessed}. Links created: ${linksCreated}. Skipped (already exist): ${linksSkipped}.`
  );
  if (errors.length) {
    console.error('Errors:', errors.length);
    errors.forEach((e) => console.error(' ', e.source, '→', e.refId, e.error));
  }
}

run()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
