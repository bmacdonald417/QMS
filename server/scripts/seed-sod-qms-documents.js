/**
 * CLI seed: create QMS Doc Control entries for the four SoD operational docs.
 *
 * These documents live in the CMMC bundle (cmmc_documents) but must also exist
 * in the QMS documents table so they surface in Doc Control and can travel the
 * review → SIA → approve → quality-release lifecycle.
 *
 * Docs seeded:
 *   MAC-SOP-235  Separation of Duties Matrix (v2.0)
 *   MAC-SOP-257  Quarterly Separation of Duties Review (v1.0)
 *   MAC-SOP-258  Privileged Onboarding to MAC-Vault-* Groups (v1.0)
 *   MAC-SOP-259  R10 Incident-Responder Break-Glass Activation (v1.0)
 *
 * Run from QMS root against prod DB:
 *
 *   railway run --service=QMS node server/scripts/seed-sod-qms-documents.js
 *
 * Idempotent: skips any documentId that already exists.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/db.js';
import { getMacTechOrgId } from '../src/lib/orgScope.js';
import { createAuditLog } from '../src/audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_BASE = resolve(
  __dirname,
  '../../docs/cmmc-extracted/docs/02-policies-and-procedures',
);

const SOD_DOCS = [
  {
    documentId: 'MAC-SOP-235',
    title: 'Separation of Duties Matrix',
    documentType: 'SOP',
    versionMajor: 2,
    versionMinor: 0,
    file: 'MAC-SOP-235_Separation_of_Duties_Matrix.md',
    tags: ['CMMC-2.0'],
    summaryOfChange:
      'v2.0 — R1–R10 CUI Vault operational SoD matrix. Operational appendix to MAC-POL-235 (AC.L2-3.1.4).',
  },
  {
    documentId: 'MAC-SOP-257',
    title: 'Quarterly Separation of Duties Review',
    documentType: 'SOP',
    versionMajor: 1,
    versionMinor: 0,
    file: 'MAC-SOP-257_SoD_Quarterly_Review_Procedure.md',
    tags: ['CMMC-2.0'],
    summaryOfChange:
      'Initial release — quarterly SoD attestation procedure (AC.L2-3.1.4[c]).',
  },
  {
    documentId: 'MAC-SOP-258',
    title: 'Privileged Onboarding to MAC-Vault-* Groups',
    documentType: 'SOP',
    versionMajor: 1,
    versionMinor: 0,
    file: 'MAC-SOP-258_Privileged_Onboarding_Procedure.md',
    tags: ['CMMC-2.0'],
    summaryOfChange:
      'Initial release — preventive provisioning-check wrapper (Invoke-MacVaultGroupMembership) for Phase 3C of AC.L2-3.1.4.',
  },
  {
    documentId: 'MAC-SOP-259',
    title: 'R10 Incident-Responder Break-Glass Activation and Post-Hoc Review',
    documentType: 'SOP',
    versionMajor: 1,
    versionMinor: 0,
    file: 'MAC-SOP-259_R10_Break_Glass_Procedure.md',
    tags: ['CMMC-2.0'],
    summaryOfChange:
      'Initial release — PIM-based R10 elevation + 24h mandatory post-hoc review (AC.L2-3.1.4).',
  },
];

async function main() {
  // Find an author — prefer Quality Manager, then any admin-tier role.
  const author = await prisma.user.findFirst({
    where: {
      role: {
        name: { in: ['Quality Manager', 'Admin', 'System Admin', 'System Administrator'] },
      },
    },
    orderBy: { createdAt: 'asc' }, // stable: earliest admin account
    select: { id: true, email: true },
  });
  if (!author) {
    throw new Error(
      'No admin/quality-manager user found in DB. Cannot seed documents without a valid authorId.',
    );
  }
  console.log(`[seed-sod-qms-documents] author resolved: ${author.email} (${author.id})`);

  const orgId = getMacTechOrgId();
  const effectiveDate = new Date('2026-05-16T00:00:00.000Z');
  const results = { created: 0, skipped: 0, errors: [] };

  for (const spec of SOD_DOCS) {
    try {
      const existing = await prisma.document.findFirst({
        where: { documentId: spec.documentId },
        select: { id: true, status: true, versionMajor: true, versionMinor: true },
      });
      if (existing) {
        console.log(
          `  = ${spec.documentId} — already in Doc Control (v${existing.versionMajor}.${existing.versionMinor}, status=${existing.status}), skipping`,
        );
        results.skipped++;
        continue;
      }

      const filePath = resolve(DOCS_BASE, spec.file);
      const content = readFileSync(filePath, 'utf-8');

      await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            documentId: spec.documentId,
            title: spec.title,
            documentType: spec.documentType,
            versionMajor: spec.versionMajor,
            versionMinor: spec.versionMinor,
            status: 'DRAFT',
            content,
            tags: spec.tags,
            authorId: author.id,
            organizationId: orgId,
            revisions: {
              create: {
                versionMajor: spec.versionMajor,
                versionMinor: spec.versionMinor,
                effectiveDate,
                authorId: author.id,
                summaryOfChange: spec.summaryOfChange,
              },
            },
          },
          select: { id: true, documentId: true },
        });

        await tx.documentHistory.create({
          data: {
            documentId: doc.id,
            userId: author.id,
            action: 'Created Draft',
            details: {
              documentId: doc.documentId,
              version: `${spec.versionMajor}.${spec.versionMinor}`,
              seededBy: 'cli/seed-sod-qms-documents.js',
            },
          },
        });
      });

      console.log(
        `  + ${spec.documentId} — created (v${spec.versionMajor}.${spec.versionMinor}, DRAFT)`,
      );
      results.created++;
    } catch (err) {
      console.error(`  ! ${spec.documentId} — ${err.message}`);
      results.errors.push({ documentId: spec.documentId, error: err.message });
    }
  }

  try {
    await createAuditLog({
      userId: null,
      action: 'DOCUMENT_SEEDED',
      entityType: 'Document',
      entityId: null,
      afterValue: {
        ...results,
        triggered_via: 'cli/seed-sod-qms-documents.js',
        docs: SOD_DOCS.map((d) => d.documentId),
      },
    });
  } catch (err) {
    console.warn('[seed-sod-qms-documents] audit log write failed:', err.message);
  }

  console.log(
    `\n[seed-sod-qms-documents] summary: created=${results.created} skipped=${results.skipped} errors=${results.errors.length}`,
  );
  if (results.errors.length > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error('[seed-sod-qms-documents] crashed:', err);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
