#!/usr/bin/env node
/**
 * Ingest governance markdown files from Quality_App_Governance_Documents_52.zip
 * into Document Control (main Document table). Converts markdown to HTML and tags with CMMC-2.0.
 *
 * Usage: node scripts/ingestGovernanceZip.js [path/to/zip] [--wipe]
 *   --wipe  Delete all documents whose documentId appears in the zip (then ingest all from zip).
 * Requires: DATABASE_URL, and at least one Admin/System Admin user.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import AdmZip from 'adm-zip';
import { marked } from 'marked';
import { prisma } from '../src/db.js';
import { parseDocumentHeader, extractMarkdownBody } from '../src/lib/cmmc/docParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const DEFAULT_ZIP_PATH = join(__dirname, '../../docs/Quality_App_Governance_Documents_52.zip');
const CMMC_TAG = 'CMMC-2.0';

const PREFIX_TO_TYPE = {
  POL: 'POLICY',
  SOP: 'SOP',
  CMP: 'CONFIGURATION_MANAGEMENT_PLAN',
  SEC: 'SECURITY',
  IT: 'IT_SYSTEM',
  IRP: 'INCIDENT_RESPONSE_PLAN',
  FRM: 'FORM',
};

/** Derive documentId and documentType from filename. Returns null if not a MAC-* doc. */
function parseFilename(name) {
  const base = name.replace(/\.md$/i, '').trim();
  if (!base) return null;

  // System_Boundary_and_Scope_MacTech_CUI_Enclave.md
  if (base.startsWith('System_') && base.includes('Boundary')) {
    return {
      documentId: 'MAC-IT-308',
      documentType: 'IT_SYSTEM',
      titleSlug: 'System Boundary and Scope – MacTech CUI Enclave',
    };
  }

  // MAC-POL-228_Authentication_Feedback_Obscure_Policy.md
  const match = base.match(/^MAC-(POL|SOP|CMP|SEC|IT|IRP|FRM)-(\d+)_?(.*)$/i);
  if (!match) return null;
  const [, prefix, num, slug] = match;
  const type = PREFIX_TO_TYPE[(prefix || '').toUpperCase()];
  if (!type) return null;
  const documentId = `MAC-${(prefix || '').toUpperCase()}-${num}`;
  const titleSlug = (slug || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { documentId, documentType: type, titleSlug };
}

/** Sanitize HTML: strip script/style and dangerous attributes. */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/** Markdown body to HTML using marked. */
function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return '';
  const raw = marked.parse(md.trim(), { async: false });
  return typeof raw === 'string' ? sanitizeHtml(raw) : '';
}

async function getAuthorId() {
  if (process.env.IMPORT_AUTHOR_ID) {
    const u = await prisma.user.findUnique({
      where: { id: process.env.IMPORT_AUTHOR_ID },
      select: { id: true },
    });
    if (u) return u.id;
  }
  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ['Admin', 'System Admin'] } } },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/** Delete documents (and related rows) by list of document ids (UUIDs). */
async function wipeDocumentIds(uuids) {
  if (uuids.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.documentLink.deleteMany({
      where: { OR: [{ sourceDocumentId: { in: uuids } }, { targetDocumentId: { in: uuids } }] },
    });
    await tx.documentComment.deleteMany({ where: { documentId: { in: uuids } } });
    await tx.documentSignature.deleteMany({ where: { documentId: { in: uuids } } });
    await tx.documentRevision.deleteMany({ where: { documentId: { in: uuids } } });
    await tx.documentHistory.deleteMany({ where: { documentId: { in: uuids } } });
    await tx.documentAssignment.deleteMany({ where: { documentId: { in: uuids } } });
    const moduleIds = (await tx.trainingModule.findMany({ where: { documentId: { in: uuids } }, select: { id: true } })).map((m) => m.id);
    if (moduleIds.length) await tx.userTrainingRecord.deleteMany({ where: { trainingModuleId: { in: moduleIds } } });
    await tx.trainingModule.deleteMany({ where: { documentId: { in: uuids } } });
    await tx.periodicReview.deleteMany({ where: { documentId: { in: uuids } } });
    await tx.document.deleteMany({ where: { id: { in: uuids } } });
  });
}

async function run() {
  const args = process.argv.slice(2).filter((a) => a !== '--wipe');
  const doWipe = process.argv.includes('--wipe');
  const zipPath = args[0] || DEFAULT_ZIP_PATH;
  const fs = await import('node:fs');
  if (!fs.existsSync(zipPath)) {
    console.error('Zip not found:', zipPath);
    process.exit(1);
  }

  const authorId = await getAuthorId();
  if (!authorId) {
    console.error('No author: set IMPORT_AUTHOR_ID or ensure an Admin/System Admin user exists.');
    process.exit(1);
  }

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Build list of (entry, parsed) for .md files we will ingest
  const toIngest = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/^[^/]+\//, '');
    if (!/\.md$/i.test(name)) continue;
    const parsed = parseFilename(name);
    if (!parsed) continue;
    toIngest.push({ entry, name, parsed });
  }

  if (doWipe && toIngest.length > 0) {
    const documentIds = [...new Set(toIngest.map(({ parsed }) => parsed.documentId))];
    const existing = await prisma.document.findMany({
      where: { documentId: { in: documentIds } },
      select: { id: true, documentId: true },
    });
    if (existing.length > 0) {
      console.log('Wiping', existing.length, 'documents by documentId:', documentIds.join(', '));
      await wipeDocumentIds(existing.map((d) => d.id));
      console.log('Wipe complete.');
    }
  }

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const { entry, name, parsed } of toIngest) {
    const { documentId, documentType, titleSlug } = parsed;
    const existing = await prisma.document.findFirst({
      where: { documentId },
      select: { id: true },
    });
    if (existing) {
      console.log('Skip (exists):', documentId);
      skipped++;
      continue;
    }

    let rawMd;
    try {
      rawMd = entry.getData().toString('utf8');
    } catch (e) {
      errors.push({ file: name, error: e.message });
      continue;
    }

    const metadata = parseDocumentHeader(rawMd);
    const body = extractMarkdownBody(rawMd);
    const title = (metadata.title && metadata.title.trim()) || titleSlug || documentId;
    const content = markdownToHtml(body);

    try {
      await prisma.document.create({
        data: {
          documentId,
          title: title.trim(),
          documentType,
          versionMajor: 1,
          versionMinor: 0,
          status: 'DRAFT',
          content,
          authorId,
          tags: [CMMC_TAG],
          revisions: {
            create: {
              versionMajor: 1,
              versionMinor: 0,
              effectiveDate: new Date(),
              authorId,
              summaryOfChange: 'Imported from governance package.',
            },
          },
        },
      });
      console.log('Created:', documentId, title.slice(0, 50) + (title.length > 50 ? '…' : ''));
      created++;
    } catch (e) {
      errors.push({ file: name, documentId, error: e.message });
    }
  }

  console.log('\nDone. Created:', created, 'Skipped:', skipped);
  if (errors.length) {
    console.error('Errors:', errors.length);
    errors.forEach((e) => console.error(' ', e.file || e.documentId, e.error));
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
