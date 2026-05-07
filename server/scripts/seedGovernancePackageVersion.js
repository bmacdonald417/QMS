/**
 * Seed (or re-publish) a Determinate MacTech Vault Governance Package
 * version. Reads the current CmmcDocument + governance-typed Document
 * state, builds a v1.2 manifest envelope, freezes it as the canonical
 * roster for that version, and marks active.
 *
 * Once published, a version is **immutable**. Re-running this script
 * with the same versionLabel REFUSES the operation unless --force is
 * passed (in which case it writes an audit log and overwrites — break
 * glass only).
 *
 * Usage:
 *   node scripts/seedGovernancePackageVersion.js --label v1.0.0
 *   node scripts/seedGovernancePackageVersion.js --label v1.0.1 --notes "added MAC-IRP-002"
 *   node scripts/seedGovernancePackageVersion.js --label v1.0.0 --force      # break-glass
 *
 * Activation: writing a new version automatically deactivates the
 * previously-active row (only one active at a time).
 */
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { prisma } from '../src/db.js';
import { buildQmsGovernanceManifestFromDocumentIds } from '../src/lib/buildQmsGovernanceManifest.js';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string' },
    notes: { type: 'string' },
    force: { type: 'boolean', default: false },
    publishedBy: { type: 'string' },
  },
});

if (!args.label || !/^v\d+\.\d+\.\d+$/.test(args.label)) {
  console.error('--label is required and must match vMAJOR.MINOR.PATCH (e.g. v1.0.0)');
  process.exit(1);
}

function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return 'null';
}

async function main() {
  const existing = await prisma.governancePackageVersion.findUnique({
    where: { versionLabel: args.label },
  });
  if (existing && !args.force) {
    console.error(
      `Version ${args.label} already exists (publishedAt=${existing.publishedAt.toISOString()}). ` +
        `Use --force to overwrite (break-glass).`,
    );
    process.exit(1);
  }
  if (existing && args.force) {
    console.warn(
      `[BREAK GLASS] Overwriting existing ${args.label} (publishedAt was ${existing.publishedAt.toISOString()}).`,
    );
  }

  // The canonical roster is the union of:
  //   - all governance-typed Documents
  //   - all CmmcDocuments
  // We seed off Documents because that's what buildQmsGovernanceManifest
  // takes as input. CmmcDocument coverage is a follow-up (Phase 14: include
  // bundle-source documents in the canonical envelope).
  const docs = await prisma.document.findMany({
    where: {
      documentType: {
        in: [
          'POLICY',
          'SOP',
          'WORK_INSTRUCTION',
          'INCIDENT_RESPONSE_PLAN',
          'CONFIGURATION_MANAGEMENT_PLAN',
          'IT_SYSTEM',
          'SECURITY',
          'AUDIT_ASSESSMENT',
        ],
      },
    },
    select: { id: true, documentId: true },
    orderBy: { documentId: 'asc' },
  });

  if (docs.length === 0) {
    console.error('No governance-typed Documents found in the QMS.');
    process.exit(1);
  }

  console.log(`Building canonical envelope from ${docs.length} Documents…`);
  const { manifest, warnings } = await buildQmsGovernanceManifestFromDocumentIds(
    docs.map((d) => d.id),
    {
      generatedBy: args.publishedBy ?? 'governance-package-seed',
      issuerClientId: 'mactech-qms-package-issuer',
      source: 'governance_package_canonical',
    },
  );
  if (!manifest) {
    console.error('Builder returned no manifest:', warnings);
    process.exit(1);
  }

  // The canonical envelope's content_hash already covers the documents.
  // The PACKAGE row's contentHash is a SECOND hash over the version metadata
  // + envelope, so re-runs of the same envelope under different versionLabels
  // are distinguishable.
  const packageBody = {
    versionLabel: args.label,
    publishedAt: new Date().toISOString(),
    envelope_run_id: manifest.run_id,
    envelope_content_hash: manifest.content_hash,
  };
  const packageContentHash = `sha256:${createHash('sha256')
    .update(canonicalize(packageBody), 'utf8')
    .digest('hex')}`;

  await prisma.$transaction(async (tx) => {
    // Deactivate any current-active version. Exactly one active row at a time.
    await tx.governancePackageVersion.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    if (existing) {
      await tx.governancePackageVersion.update({
        where: { versionLabel: args.label },
        data: {
          publishedAt: new Date(),
          publishedBy: args.publishedBy ?? null,
          contentHash: packageContentHash,
          manifestEnvelope: manifest,
          docCount: manifest.documents.length,
          controlsTouched: manifest.controls_touched,
          isActive: true,
          notes: args.notes ?? null,
        },
      });
    } else {
      await tx.governancePackageVersion.create({
        data: {
          versionLabel: args.label,
          publishedAt: new Date(),
          publishedBy: args.publishedBy ?? null,
          contentHash: packageContentHash,
          manifestEnvelope: manifest,
          docCount: manifest.documents.length,
          controlsTouched: manifest.controls_touched,
          isActive: true,
          notes: args.notes ?? null,
        },
      });
    }
  });

  console.log('---');
  console.log(`Published canonical package ${args.label}`);
  console.log(`  doc_count:        ${manifest.documents.length}`);
  console.log(`  controls_touched: ${manifest.controls_touched.length} unique`);
  console.log(`  envelope hash:    ${manifest.content_hash}`);
  console.log(`  package hash:     ${packageContentHash}`);
  console.log(`  released_docs:    ${manifest.release_summary.released_docs}`);
  console.log(`  unreleased_docs:  ${manifest.release_summary.unreleased_docs}`);
  if (warnings.length) console.log(`  warnings:         ${warnings.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
