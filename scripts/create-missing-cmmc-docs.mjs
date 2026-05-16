/**
 * Creates QMS documents for every CMMC bundle entry that doesn't yet have a
 * matching documentId in the documents table. Run once; safe to re-run.
 */
import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, '../server/docs/cmmc-extracted/qms-ingest-manifest.json');
const DB_URL = 'postgresql://postgres:VbJDcWRTfqFoQUVCYFOEMllDUCGotEbD@maglev.proxy.rlwy.net:53814/railway';

const AUTHOR_ID = 'bb969154-9c24-4db0-a586-3bb0dd5c7977';
const ORG_ID    = '632aedb5-f302-4147-b9f8-6e6a51760151';

// Map CMMC bundle "kind" → Prisma DocumentType enum
const KIND_TO_TYPE = {
  plan:        'CONFIGURATION_MANAGEMENT_PLAN',
  scope:       'IT_SYSTEM',
  policy:      'POLICY',
  procedure:   'SOP',
  form:        'FORM',
  record:      'AUDIT_ASSESSMENT',
  assessment:  'AUDIT_ASSESSMENT',
  guide:       'SECURITY',
  template:    'OTHER',
  reference:   'OTHER',
  security_guide: 'SECURITY',
  ssp:         'SSP',
};

// Special overrides for specific codes
const CODE_TO_TYPE = {
  'MAC-IRP-001': 'INCIDENT_RESPONSE_PLAN',
  'MAC-IT-304':  'SSP',
};

function docTypeFor(code, kind) {
  return CODE_TO_TYPE[code] ?? KIND_TO_TYPE[kind] ?? 'OTHER';
}

const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const bundleDocs = manifest.documents ?? [];

  // Existing codes in QMS
  const existing = await db.document.findMany({ select: { documentId: true } });
  const existingCodes = new Set(existing.map(d => d.documentId));

  const missing = bundleDocs.filter(d => !existingCodes.has(d.code));
  console.log(`Bundle: ${bundleDocs.length} docs | QMS: ${existingCodes.size} docs | Missing: ${missing.length}`);

  if (missing.length === 0) {
    console.log('Nothing to create.');
    return;
  }

  let created = 0;
  for (const doc of missing) {
    const docType = docTypeFor(doc.code, doc.kind);
    try {
      await db.document.create({
        data: {
          documentId:     doc.code,
          title:          doc.title,
          documentType:   docType,
          status:         'DRAFT',
          authorId:       AUTHOR_ID,
          organizationId: ORG_ID,
          versionMajor:   1,
          versionMinor:   0,
          content:        `# ${doc.title}\n\n<!-- Imported from CMMC L2 bundle. Add content here. -->`,
          tags:           ['cmmc', 'cmmc-l2'],
        },
      });
      console.log(`  ✓ created  ${doc.code}  (${docType})`);
      created++;
    } catch (err) {
      console.error(`  ✗ failed   ${doc.code}: ${err.message}`);
    }
  }

  console.log(`\nDone — created ${created}/${missing.length}`);
}

main().finally(() => db.$disconnect());
