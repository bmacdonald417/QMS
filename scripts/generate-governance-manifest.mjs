#!/usr/bin/env node
/**
 * Build governance-manifest.json for Trust Codex from the QMS CMMC bundle.
 *
 * Reads: docs/cmmc-extracted/qms-ingest-manifest.json + markdown files on disk.
 * Optional: governance-control-mapping.json, QMS state export, previous manifest (drift).
 *
 * Same behavior as scripts/Generate-GovernanceManifest.ps1 — see that file for
 * hash semantics (file SHA-256 vs QMS content_hash in DB).
 *
 * Usage:
 *   node scripts/generate-governance-manifest.mjs
 *   node scripts/generate-governance-manifest.mjs --bundle ./docs/cmmc-extracted --out ./governance-manifest.json
 *   node scripts/generate-governance-manifest.mjs --previous ./governance-manifest.prev.json
 *   npm run gov:manifest
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TOOL_VERSION = '1.0.0';
const SCHEMA_ID = 'mactech-governance-manifest.v1';

function newRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const rand = randomBytes(3).toString('hex');
  return `GOV-${ts}-${rand}`;
}

function mapQmsStatus(raw) {
  if (!raw) return 'effective';
  const u = String(raw).toUpperCase();
  const map = { DRAFT: 'draft', IN_REVIEW: 'in_review', EFFECTIVE: 'effective', RETIRED: 'retired' };
  return map[u] ?? String(raw).toLowerCase().replace(/-/g, '_');
}

function documentType(code, kind) {
  if (/^MAC-POL-/.test(code)) return 'policy';
  if (/^MAC-SOP-/.test(code)) return 'procedure';
  if (/^MAC-SEC-/.test(code)) return 'security_guide';
  if (/^MAC-CMP-/.test(code)) return 'plan';
  if (/^MAC-IT-/.test(code)) return 'ssp';
  const k = String(kind || '').toLowerCase();
  if (k === 'policy') return 'policy';
  if (k === 'procedure') return 'procedure';
  if (k === 'plan') return 'plan';
  if (k === 'guide') return 'security_guide';
  if (k === 'scope') return 'reference';
  return kind || 'reference';
}

function parseIsoDate(text) {
  if (!text) return null;
  const t = String(text).trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addReviewCadence(base, cadence) {
  const c = String(cadence || '').toLowerCase();
  const d = new Date(base.getTime());
  if (c.includes('month')) d.setMonth(d.getMonth() + 1);
  else if (c.includes('quarter')) d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      bundle: { type: 'string', short: 'b' },
      out: { type: 'string', short: 'o' },
      'generated-by': { type: 'string' },
      previous: { type: 'string', short: 'p' },
      'control-plane-url': { type: 'string' },
      'qms-state': { type: 'string' },
      'control-mapping': { type: 'string' },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: node scripts/generate-governance-manifest.mjs [options]

Options:
  --bundle, -b           CMMC bundle root (folder with qms-ingest-manifest.json)
  --out, -o              Output path (default: ./governance-manifest.json)
  --generated-by         Email for generated_by
  --previous, -p         Previous manifest JSON for drift
  --control-plane-url    Trust Codex base URL for upload hint
  --qms-state            JSON file with optional DB/export fields per document code
  --control-mapping      Path to governance-control-mapping.json
  --verbose, -v
  --help, -h
`);
    process.exit(0);
  }

  const bundleRoot = resolve(
    values.bundle || join(REPO_ROOT, 'docs/cmmc-extracted')
  );
  const manifestPath = join(bundleRoot, 'qms-ingest-manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const mappingPath = resolve(
    values['control-mapping'] || join(__dirname, 'governance-control-mapping.json')
  );
  if (!existsSync(mappingPath)) {
    console.error(`Control mapping not found: ${mappingPath}`);
    process.exit(1);
  }

  process.env.CMMC_BUNDLE_PATH = bundleRoot;
  const { parseDocumentHeader } = await import('../server/src/lib/cmmc/docParser.js');

  const ingest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const controlMap = JSON.parse(readFileSync(mappingPath, 'utf8'));

  const manifestCodes = new Set((ingest.documents || []).map((d) => d.code));
  for (const code of Object.keys(controlMap)) {
    if (!manifestCodes.has(code)) {
      console.warn(
        `Warning: Control mapping references ${code} but it is not listed in qms-ingest-manifest.json.`
      );
    }
  }

  let qmsState = null;
  let qmsDocByCode = {};
  if (values['qms-state']) {
    const raw = readFileSync(resolve(values['qms-state']), 'utf8');
    qmsState = JSON.parse(raw);
    if (qmsState.documents && typeof qmsState.documents === 'object') {
      qmsDocByCode = { ...qmsState.documents };
    }
  }

  let prevObj = null;
  let prevPath = '';
  if (values.previous) {
    prevPath = resolve(values.previous);
    if (existsSync(prevPath)) {
      prevObj = JSON.parse(readFileSync(prevPath, 'utf8'));
    }
  }

  let generatedBy =
    values['generated-by'] ||
    (qmsState && qmsState.generated_by) ||
    process.env.TRUST_CODEX_USER ||
    process.env.USER ||
    'unknown';

  const runId = newRunId();
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const documents = [];
  const noMapping = [];
  const missingFiles = [];
  const allControlIds = [];
  let controlsMappedTotal = 0;

  for (const entry of ingest.documents || []) {
    const code = String(entry.code);
    const relPath = String(entry.path);
    const fullPath = join(bundleRoot, relPath);

    let controls = controlMap[code];
    if (!Array.isArray(controls)) controls = [];
    if (
      controls.length === 0 &&
      /^MAC-(POL|SOP|SEC|CMP|IT)-/.test(code)
    ) {
      console.warn(
        `Warning: No control mapping for document_number ${code} (Trust Codex mapping table).`
      );
      noMapping.push(code);
    }
    for (const c of controls) allControlIds.push(c);
    controlsMappedTotal += controls.length;

    const docType = documentType(code, entry.kind);

    let status = 'effective';
    let nextReview = null;
    let effDateStr = null;
    let versionStr = '1.0';
    let signatureBlock = null;

    const st = qmsDocByCode[code];
    if (st) {
      if (st.status) status = mapQmsStatus(st.status);
      if (st.next_review_date) nextReview = String(st.next_review_date);
      if (st.signature || st.revision) {
        signatureBlock = {};
        const sig = st.signature;
        const rev = st.revision;
        if (sig) {
          if (sig.signed_by) signatureBlock.signed_by = String(sig.signed_by);
          if (sig.signed_at) signatureBlock.signed_at = String(sig.signed_at);
          if (sig.signature_hash)
            signatureBlock.signature_hash = String(sig.signature_hash);
        }
        if (rev) {
          if (rev.content_hash)
            signatureBlock.qms_content_hash = String(rev.content_hash);
          if (rev.signing_hash)
            signatureBlock.qms_signing_hash = String(rev.signing_hash);
        }
        if (Object.keys(signatureBlock).length === 0) signatureBlock = null;
      }
    }

    if (!existsSync(fullPath)) {
      console.warn(`Warning: File missing on disk: ${relPath} (code ${code})`);
      missingFiles.push(code);
      continue;
    }

    const fileBuf = readFileSync(fullPath);
    const sha256 = createHash('sha256').update(fileBuf).digest('hex');
    const sizeBytes = fileBuf.length;

    const mdRaw = fileBuf.toString('utf8');
    const headerMeta = parseDocumentHeader(mdRaw);
    if (headerMeta.version) versionStr = headerMeta.version;

    const d = parseIsoDate(headerMeta.date);
    if (d) {
      effDateStr = d.toISOString().slice(0, 10);
      if (!nextReview) {
        const nr = addReviewCadence(d, entry.review_cadence);
        nextReview = nr.toISOString().slice(0, 10);
      }
    }

    let title = String(entry.title);
    if (headerMeta.title) title = headerMeta.title;

    const docObj = {
      document_number: code,
      document_name: title,
      document_type: docType,
      file_path: relPath.replace(/\\/g, '/'),
      version: versionStr,
      effective_date: effDateStr,
      next_review_date: nextReview,
      status,
      sha256,
      file_size_bytes: sizeBytes,
      controls_mapped: controls,
    };
    if (signatureBlock) docObj.signature = signatureBlock;
    documents.push(docObj);
  }

  const uniqueControls = [...new Set(allControlIds)].sort();
  const byType = {};
  for (const d of documents) {
    const t = d.document_type;
    byType[t] = (byType[t] || 0) + 1;
  }

  const outRoot = {
    schema: SCHEMA_ID,
    generated_at: generatedAt,
    generated_by: generatedBy,
    tool_version: TOOL_VERSION,
    run_id: runId,
    base_path: bundleRoot,
    documents,
    summary: {
      total_documents: documents.length,
      hash_algorithm: 'SHA-256',
      controls_mapped_total: controlsMappedTotal,
      unique_controls_covered: uniqueControls.length,
      by_type: byType,
    },
  };

  let driftDetected = false;
  let driftChanged = 0;
  let driftNew = 0;
  let driftMissing = 0;

  if (prevObj && Array.isArray(prevObj.documents)) {
    const prevMap = Object.fromEntries(
      prevObj.documents.map((p) => [String(p.document_number), p])
    );
    const currMap = Object.fromEntries(
      documents.map((d) => [d.document_number, d])
    );

    const newDocNumbers = Object.keys(currMap).filter((k) => !prevMap[k]);
    driftNew = newDocNumbers.length;

    const changed = [];
    for (const k of Object.keys(currMap)) {
      if (!prevMap[k]) continue;
      const ps = String(prevMap[k].sha256 || '');
      const cs = String(currMap[k].sha256 || '');
      if (ps !== cs) {
        driftDetected = true;
        driftChanged++;
        changed.push({
          document_number: k,
          previous_sha256: ps,
          current_sha256: cs,
          change_detected_at: generatedAt,
        });
        console.warn(`Warning: DRIFT: document ${k} SHA-256 changed.`);
      }
    }

    const missing = Object.keys(prevMap).filter((k) => !currMap[k]);
    driftMissing = missing.length;

    outRoot.drift_report = {
      checked_against: prevPath,
      previous_generated_at: String(prevObj.generated_at || ''),
      changed_documents: changed,
      new_documents: newDocNumbers,
      missing_documents: missing,
    };
  }

  const json = `${JSON.stringify(outRoot, null, 2)}\n`;

  const outPath = resolve(values.out || join(process.cwd(), 'governance-manifest.json'));
  writeFileSync(outPath, json, { encoding: 'utf8' });

  const archivePath = join(dirname(outPath), `governance-manifest-${runId}.json`);
  writeFileSync(archivePath, json, { encoding: 'utf8' });

  let uploadLine =
    'Upload governance-manifest.json to Trust Codex at: /dashboard/governance/upload-manifest';
  if (values['control-plane-url']) {
    const base = String(values['control-plane-url']).replace(/\/$/, '');
    uploadLine = `Upload governance-manifest.json to Trust Codex at: ${base}/dashboard/governance/upload-manifest`;
  }

  console.log('');
  console.log('=== Governance manifest ===');
  console.log(`Documents processed: ${documents.length}`);
  console.log(`Controls mapped (total control references): ${controlsMappedTotal}`);
  console.log(`Unique controls covered: ${uniqueControls.length}`);
  console.log(`Documents with no control mapping (MAC-*): ${noMapping.length}`);
  if (noMapping.length) console.log(`  ${noMapping.join(', ')}`);
  console.log(`Files missing on disk (skipped): ${missingFiles.length}`);
  if (missingFiles.length) console.log(`  ${missingFiles.join(', ')}`);
  if (prevObj) {
    console.log(
      `Drift detected: ${driftDetected ? 'Yes' : 'No'} (${driftChanged} changed, ${driftNew} new, ${driftMissing} missing)`
    );
  } else {
    console.log('Drift detected: N/A (no --previous)');
  }
  console.log(`Output written to: ${outPath}`);
  console.log(`Archive copy:      ${archivePath}`);
  console.log(`run_id: ${runId}`);
  console.log('');
  console.log(uploadLine);
  console.log('');

  if (values.verbose && positionals.length) {
    console.log('Extra positionals (ignored):', positionals);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
