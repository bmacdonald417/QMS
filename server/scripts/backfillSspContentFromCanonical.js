/**
 * Backfill QMS Document.content for SSP documents created via the
 * external-submissions bridge.
 *
 * Background: the bridge handler used to write only a short stub
 * wrapper into Document.content. The full canonical SSP content was
 * preserved in external_document_submissions.payload_json.artifacts.canonical_json
 * but never surfaced into the Document, so the read-only /view page
 * rendered as 2–4 pages instead of the full ~100+ page SSP.
 *
 * This script:
 *   1. Finds every Document with documentType=SSP that still has the
 *      stub wrapper as content (heuristic: content < 5KB and starts
 *      with "# System Security Plan —")
 *   2. Joins to its external_document_submissions row to pull
 *      payload_json.artifacts.canonical_json
 *   3. Re-renders via renderSspCanonicalToMarkdown()
 *   4. UPDATEs the Document.content
 *
 * Read-only by default. Pass --apply to actually write.
 *
 *   railway run node scripts/backfillSspContentFromCanonical.js [--apply] [--doc=SSP-017]
 */
import { prisma } from '../src/db.js';
import { renderSspCanonicalToMarkdown } from '../src/lib/renderSspCanonicalToMarkdown.js';

const APPLY = process.argv.includes('--apply');
const DOC_ARG = (process.argv.find((a) => a.startsWith('--doc=')) ?? '').split('=')[1] || null;

async function main() {
  console.log(`Backfill SSP Document.content from canonical_json. apply=${APPLY} doc=${DOC_ARG ?? 'all'}`);

  const docs = await prisma.document.findMany({
    where: {
      documentType: 'SSP',
      ...(DOC_ARG ? { documentId: DOC_ARG } : {}),
    },
    select: { id: true, documentId: true, title: true, status: true, content: true, organizationId: true },
  });

  console.log(`Found ${docs.length} SSP-typed docs.`);

  let touched = 0;
  let skipped = 0;

  for (const doc of docs) {
    const contentLen = doc.content?.length ?? 0;
    const looksLikeStub = contentLen < 5000 && doc.content?.startsWith('# System Security Plan');

    if (!looksLikeStub) {
      console.log(`  ${doc.documentId}: content=${contentLen} chars; doesn't match stub pattern, skipping`);
      skipped++;
      continue;
    }

    // Find the matching external submission row for this Document.
    const submission = await prisma.externalDocumentSubmission.findFirst({
      where: { qmsDocumentId: doc.id },
      select: { id: true, payloadJson: true, externalSubmissionId: true, externalVersionNumber: true },
    });
    if (!submission) {
      console.log(`  ${doc.documentId}: no external_document_submissions row, skipping`);
      skipped++;
      continue;
    }

    const pj = submission.payloadJson;
    const canonical = pj?.artifacts?.canonical_json;
    if (!canonical) {
      console.log(`  ${doc.documentId}: payload_json.artifacts.canonical_json missing, skipping`);
      skipped++;
      continue;
    }

    const rendered = renderSspCanonicalToMarkdown(canonical, {
      boundary_name: pj.boundary_name,
      generated_at: pj.generated_at,
      payload_sha256: pj.payload_sha256,
      ssp_version_number: pj.ssp_version_number,
      controls_mapped: pj.controls_mapped,
    });

    const provenanceFooter = [
      '',
      '---',
      '',
      '## Provenance — Codex signoffs preserved as evidence',
      '',
      `**Source:** Trust Codex (https://codex.mactechsolutionsllc.com)  `,
      `**Submission ID:** \`${pj.submission_id}\`  `,
      '',
      ...((pj.signoffs ?? []).map(
        (s) => `- **${s.kind}** — ${s.signer_display_name} (${s.signer_title}) on ${s.signed_at}`,
      )),
      '',
      '## QMS release chain',
      '',
      `Walked through Reviewer → Approver → Quality Release on QMS. Released back to Codex via the next manifest export.`,
    ].join('\n');

    const fullContent = rendered + provenanceFooter;
    console.log(`  ${doc.documentId}: stub=${contentLen}B  →  rendered=${fullContent.length}B (sections=${(canonical.sections ?? []).length})`);

    if (APPLY) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { content: fullContent },
      });
      console.log(`    ✓ updated`);
    }
    touched++;
  }

  console.log(`\nTouched: ${touched}  Skipped: ${skipped}  Apply: ${APPLY}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
