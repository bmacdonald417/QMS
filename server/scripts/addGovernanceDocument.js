#!/usr/bin/env node
/**
 * Add a single governance markdown file as a Document Control document.
 * Uses same parsing and create logic as ingestGovernanceZip.js.
 *
 * Usage: node scripts/addGovernanceDocument.js <path-to-file.md>
 * Example: node scripts/addGovernanceDocument.js /path/to/MAC-SEC-312_Inherited_Control_Statement.md
 *
 * Requires: DATABASE_URL, and at least one Admin/System Admin user.
 * Skips if documentId already exists.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { marked } from 'marked';
import { prisma } from '../src/db.js';
import { parseDocumentHeader, extractMarkdownBody } from '../src/lib/cmmc/docParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

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

function parseFilename(name) {
  const base = name.replace(/\.md$/i, '').trim();
  if (!base) return null;
  if (base.startsWith('System_') && base.includes('Boundary')) {
    return {
      documentId: 'MAC-IT-308',
      documentType: 'IT_SYSTEM',
      titleSlug: 'System Boundary and Scope – MacTech CUI Enclave',
    };
  }
  const match = base.match(/^MAC-(POL|SOP|CMP|SEC|IT|IRP|FRM)-(\d+)_?(.*)$/i);
  if (!match) return null;
  const [, prefix, num, slug] = match;
  const type = PREFIX_TO_TYPE[(prefix || '').toUpperCase()];
  if (!type) return null;
  const documentId = `MAC-${(prefix || '').toUpperCase()}-${num}`;
  const titleSlug = (slug || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return { documentId, documentType: type, titleSlug };
}

function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

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

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/addGovernanceDocument.js <path-to-file.md>');
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const name = filePath.split(/[/\\]/).pop();
  const parsed = parseFilename(name);
  if (!parsed) {
    console.error('Filename must match MAC-XXX-NNN_title.md (e.g. MAC-SEC-312_Title.md). Got:', name);
    process.exit(1);
  }

  const authorId = await getAuthorId();
  if (!authorId) {
    console.error('No author: set IMPORT_AUTHOR_ID or ensure an Admin/System Admin user exists.');
    process.exit(1);
  }

  const existing = await prisma.document.findFirst({
    where: { documentId: parsed.documentId },
    select: { id: true },
  });
  if (existing) {
    console.log('Skip (exists):', parsed.documentId);
    await prisma.$disconnect();
    return;
  }

  const rawMd = readFileSync(filePath, 'utf8');
  const metadata = parseDocumentHeader(rawMd);
  const body = extractMarkdownBody(rawMd);
  const title = (metadata.title && metadata.title.trim()) || parsed.titleSlug || parsed.documentId;
  const content = markdownToHtml(body);

  await prisma.document.create({
    data: {
      documentId: parsed.documentId,
      title: title.trim(),
      documentType: parsed.documentType,
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
          summaryOfChange: 'Imported from governance document.',
        },
      },
    },
  });

  console.log('Created:', parsed.documentId, title.slice(0, 60) + (title.length > 60 ? '…' : ''));
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
