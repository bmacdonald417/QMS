/**
 * CLI mirror of POST /api/cmmc/documents/sync (cmmc.js:290).
 *
 * Reuses the exact same logic as the HTTP route — loadManifest +
 * readDocumentFile + prisma upserts — but bypasses the JWT auth layer
 * because there's no HTTP request involved. Intended for operator-
 * triggered one-shots (initial seed of new manifest entries, recovery
 * after manifest drift, CI/CD post-deploy hook in the future).
 *
 * Run from QMS root, against prod DB via Railway:
 *
 *   cd /Users/patrick/QMS
 *   railway run --service=QMS node server/scripts/sync-cmmc-documents.js
 *
 * Or with explicit DATABASE_URL:
 *
 *   DATABASE_URL='postgresql://…' node server/scripts/sync-cmmc-documents.js
 *
 * Output: per-doc created/updated/skipped lines + a final summary.
 *
 * Audit log: creates a CMMC_SYNC entry with userId=null and a synthetic
 * actor tag so the assessor can distinguish CLI-triggered syncs from
 * dashboard ones.
 */
import { prisma } from '../src/db.js';
import { loadManifest } from '../src/lib/cmmc/manifest.js';
import { readDocumentFile, parseEffectiveDate } from '../src/lib/cmmc/docParser.js';
import { normalizeMarkdown } from '../src/lib/cmmc/canonicalize.js';
import { computeContentHash, computeManifestHash } from '../src/lib/cmmc/hashing.js';
import { getMacTechOrgId } from '../src/lib/orgScope.js';
import { createAuditLog } from '../src/audit.js';

async function main() {
  console.log('[sync-cmmc-documents] loading manifest…');
  const { documents: manifest } = await loadManifest();
  console.log(`[sync-cmmc-documents] manifest has ${manifest.length} entries`);

  const summary = { processed: 0, created: 0, updated: 0, unchanged: 0, errors: [] };

  for (const manifestDoc of manifest) {
    try {
      summary.processed++;
      const { metadata: fileMetadata, body } = readDocumentFile(manifestDoc.path);
      const normalizedBody = normalizeMarkdown(body);
      const contentHash = computeContentHash(normalizedBody);
      const manifestHash = computeManifestHash(manifestDoc);

      const existing = await prisma.cmmcDocument.findUnique({
        where: { code: manifestDoc.code },
        include: {
          revisions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (!existing) {
        await prisma.cmmcDocument.create({
          data: {
            code: manifestDoc.code,
            title: manifestDoc.title,
            kind: manifestDoc.kind,
            path: manifestDoc.path,
            qmsDocType: manifestDoc.qms_doc_type,
            reviewCadence: manifestDoc.review_cadence || null,
            status: 'DRAFT',
            organizationId: getMacTechOrgId(),
            effectiveDate: parseEffectiveDate(fileMetadata.date),
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
        console.log(`  + ${manifestDoc.code} — created`);
      } else {
        const latestRevision = existing.revisions[0];
        const contentChanged = !latestRevision || latestRevision.contentHash !== contentHash;

        if (contentChanged) {
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
          const newEffectiveDate = parseEffectiveDate(fileMetadata.date);
          if (newEffectiveDate && existing.effectiveDate?.getTime() !== newEffectiveDate.getTime()) {
            await prisma.cmmcDocument.update({
              where: { id: existing.id },
              data: { effectiveDate: newEffectiveDate },
            });
          }
          summary.updated++;
          console.log(`  ~ ${manifestDoc.code} — new revision`);
        } else {
          summary.unchanged++;
        }

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
      summary.errors.push({ code: manifestDoc.code, error: error.message });
      console.error(`  ! ${manifestDoc.code} — ${error.message}`);
    }
  }

  try {
    await createAuditLog({
      userId: null,
      action: 'CMMC_SYNC',
      entityType: 'CmmcDocument',
      entityId: null,
      afterValue: { ...summary, triggered_via: 'cli/sync-cmmc-documents.js' },
    });
  } catch (err) {
    console.error('[sync-cmmc-documents] audit log write failed:', err.message);
  }

  console.log(
    `\n[sync-cmmc-documents] summary: processed=${summary.processed} created=${summary.created} updated=${summary.updated} unchanged=${summary.unchanged} errors=${summary.errors.length}`,
  );
  if (summary.errors.length > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('[sync-cmmc-documents] crashed:', err);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
