#!/usr/bin/env node
/**
 * Script to ingest CMMC documents from the local bundle
 * Run with: node scripts/ingestCmmc.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Use DATABASE_PUBLIC_URL for local development if available
if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL?.includes('railway.internal')) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

import { prisma } from '../src/db.js';
import { loadManifest } from '../src/lib/cmmc/manifest.js';
import { readDocumentFile } from '../src/lib/cmmc/docParser.js';
import { normalizeMarkdown } from '../src/lib/cmmc/canonicalize.js';
import { computeContentHash, computeManifestHash } from '../src/lib/cmmc/hashing.js';

async function ingestCmmcDocuments() {
  try {
    console.log('Loading manifest...');
    const { documents } = await loadManifest();
    console.log(`Found ${documents.length} documents in manifest`);

    const summary = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: [],
    };

    for (const manifestDoc of documents) {
      try {
        summary.processed++;
        console.log(`Processing ${manifestDoc.code}...`);

        // Read and parse file
        const { metadata: fileMetadata, body } = readDocumentFile(manifestDoc.path);
        const normalizedBody = normalizeMarkdown(body);
        const contentHash = computeContentHash(normalizedBody);
        const manifestHash = computeManifestHash(manifestDoc);

        // Check if document exists
        const existing = await prisma.cmmcDocument.findUnique({
          where: { code: manifestDoc.code },
          include: {
            revisions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        if (!existing) {
          // Create new document
          await prisma.cmmcDocument.create({
            data: {
              code: manifestDoc.code,
              title: manifestDoc.title,
              kind: manifestDoc.kind,
              path: manifestDoc.path,
              qmsDocType: manifestDoc.qms_doc_type,
              reviewCadence: manifestDoc.review_cadence || null,
              status: 'DRAFT',
              revisions: {
                create: {
                  revisionLabel: fileMetadata.version || '1.0',
                  date: fileMetadata.date || new Date().toISOString().split('T')[0],
                  classification: fileMetadata.classification || null,
                  framework: fileMetadata.framework || null,
                  reference: fileMetadata.reference || null,
                  appliesTo: fileMetadata.appliesTo || null,
                  contentHash,
                  manifestHash,
                },
              },
            },
          });
          summary.created++;
          console.log(`  ✓ Created: ${manifestDoc.code}`);
        } else {
          // Check if content changed
          const latestRevision = existing.revisions[0];
          const contentChanged = !latestRevision || latestRevision.contentHash !== contentHash;

          if (contentChanged) {
            // Create new revision
            await prisma.cmmcRevision.create({
              data: {
                documentId: existing.id,
                revisionLabel: fileMetadata.version || '1.0',
                date: fileMetadata.date || new Date().toISOString().split('T')[0],
                classification: fileMetadata.classification || null,
                framework: fileMetadata.framework || null,
                reference: fileMetadata.reference || null,
                appliesTo: fileMetadata.appliesTo || null,
                contentHash,
                manifestHash,
              },
            });
            summary.updated++;
            console.log(`  ✓ Updated: ${manifestDoc.code}`);
          } else {
            console.log(`  - No changes: ${manifestDoc.code}`);
          }

          // Update document metadata if needed
          if (
            existing.title !== manifestDoc.title ||
            existing.kind !== manifestDoc.kind ||
            existing.path !== manifestDoc.path ||
            existing.qmsDocType !== manifestDoc.qms_doc_type ||
            existing.reviewCadence !== (manifestDoc.review_cadence || null)
          ) {
            await prisma.cmmcDocument.update({
              where: { code: manifestDoc.code },
              data: {
                title: manifestDoc.title,
                kind: manifestDoc.kind,
                path: manifestDoc.path,
                qmsDocType: manifestDoc.qms_doc_type,
                reviewCadence: manifestDoc.review_cadence || null,
              },
            });
          }
        }
      } catch (error) {
        summary.errors.push({
          code: manifestDoc.code,
          error: error.message,
        });
        console.error(`  ✗ Error processing ${manifestDoc.code}:`, error.message);
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Processed: ${summary.processed}`);
    console.log(`Created: ${summary.created}`);
    console.log(`Updated: ${summary.updated}`);
    if (summary.errors.length > 0) {
      console.log(`Errors: ${summary.errors.length}`);
      summary.errors.forEach((err) => {
        console.log(`  - ${err.code}: ${err.error}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

ingestCmmcDocuments();
