/**
 * Build Trust Codex governance manifest JSON (v1.1) from QMS document UUIDs.
 *
 * Schema: `mactech-governance-manifest.v1.1` — adds chain-of-custody fields
 * (content_hash, signing_hash, signature) + controls_touched + doc_count +
 * issuer block on top of Brian's v1. The codex side accepts only v1.1 at
 * /api/integrations/qms-manifest/ingest because it verifies the signature
 * and rejects unsigned envelopes.
 *
 * Control mapping resolution order (highest priority first):
 *   1. Phase 6 junctions (DocumentCmmcControlTag)
 *   2. Legacy GovernanceControlMapping (documentNumber → controlIds[])
 *   3. Empty (warning emitted)
 *
 * Signing chain (locked in docs/specs/qms-governance-manifest-ingest-brief.md
 * on the codex repo): canonical-JSON of the body → SHA-256 → content_hash;
 * `${content_hash}|${run_id}|${generated_at}|${issuer.client_id}` →
 * SHA-256 → signing_hash; HMAC-SHA-256(QMS_MANIFEST_SIGNING_SECRET,
 * signing_hash) → base64url → signature.value.
 *
 * Set QMS_MANIFEST_SIGNING_SECRET in env to enable signing. Without it,
 * builder still produces a v1.1-shaped envelope but signature.value is
 * null and codex will reject the manifest at HMAC verify (intentional —
 * fail loud rather than ship unsigned).
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';

export function newGovernanceRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `GOV-${ts}-${randomBytes(3).toString('hex')}`;
}

function qmsDocumentTypeToManifestType(dt) {
  const m = {
    POLICY: 'policy',
    SOP: 'procedure',
    WORK_INSTRUCTION: 'procedure',
    FORM: 'form',
    IT_SYSTEM: 'ssp',
    SECURITY: 'security_guide',
    AUDIT_ASSESSMENT: 'assessment',
    INCIDENT_RESPONSE_PLAN: 'plan',
    CONFIGURATION_MANAGEMENT_PLAN: 'plan',
    OTHER: 'reference',
  };
  return m[dt] || 'reference';
}

function mapDocumentStatusToManifest(status) {
  const s = String(status || '').toUpperCase();
  const map = {
    DRAFT: 'draft',
    IN_REVIEW: 'in_review',
    AWAITING_APPROVAL: 'in_review',
    APPROVED: 'approved',
    PENDING_APPROVAL: 'pending_approval',
    PENDING_QUALITY_RELEASE: 'pending_quality_release',
    EFFECTIVE: 'effective',
    OBSOLETE: 'obsolete',
    ARCHIVED: 'archived',
  };
  return map[s] || String(status || 'draft').toLowerCase().replace(/-/g, '_');
}

const GOVERNANCE_TYPES = new Set(['policy', 'procedure', 'plan', 'ssp', 'security_guide']);

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic JSON canonicalization. Sorted keys at every depth, no
// whitespace, primitives JSON-encoded, undefined dropped. Mirrors the
// codex-side canonicalize in src/lib/integrations/qms-manifest-verify.ts —
// any drift fails the codex ingest.
// ─────────────────────────────────────────────────────────────────────────────
function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
  }
  return 'null';
}

function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function computeContentHash({ run_id, generated_at, source, documents, controls_touched, doc_count }) {
  const body = {
    run_id,
    generated_at,
    source,
    documents: documents.map((d) => ({
      controls_mapped: [...d.controls_mapped].sort(),
      document_name: d.document_name,
      document_number: d.document_number,
      document_type: d.document_type ?? null,
      effective_date: d.effective_date ?? null,
      file_path: d.file_path ?? null,
      file_size_bytes: d.file_size_bytes ?? null,
      next_review_date: d.next_review_date ?? null,
      sha256: String(d.sha256 ?? '').toLowerCase(),
      status: d.status ?? null,
      version: d.version ?? null,
    })),
    controls_touched: [...controls_touched].sort(),
    doc_count,
  };
  return `sha256:${sha256Hex(canonicalize(body))}`;
}

function computeSigningHash({ content_hash, run_id, generated_at, issuer_client_id }) {
  const composed = `${content_hash}|${run_id}|${generated_at}|${issuer_client_id}`;
  return `sha256:${sha256Hex(composed)}`;
}

function signHmac(signingHash) {
  const secret = process.env.QMS_MANIFEST_SIGNING_SECRET;
  if (!secret) return { kid: 'qms-manifest-unset', value: null };
  const value = createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signingHash, 'utf8')
    .digest('base64url');
  // Single-key today; bump kid on rotation. Codex tolerates any kid as
  // long as the secret matches.
  return { kid: process.env.QMS_MANIFEST_SIGNING_KID || 'qms-manifest-2026-05', value };
}

/**
 * Resolve the control IDs for a document, junction-first then legacy
 * mapping fallback, then empty. Returns the resolved set + a source tag
 * for ingest-log visibility.
 */
async function resolveControlsFor(document, platformMap) {
  // 1. Phase 6 junctions on this Document row.
  const tags = await prisma.documentCmmcControlTag.findMany({
    where: { documentId: document.id },
    select: { controlId: true },
  });
  const fromJunctions = new Set(tags.map((t) => t.controlId));
  if (fromJunctions.size > 0) {
    return { ids: Array.from(fromJunctions), source: 'junctions' };
  }
  // 2. Legacy mapping (Brian's seeded data).
  const legacy = platformMap.get(document.documentId);
  if (Array.isArray(legacy) && legacy.length > 0) {
    return { ids: [...legacy], source: 'platform_mapping' };
  }
  // 3. Nothing on file.
  return { ids: [], source: 'none' };
}

/**
 * @param {string[]} documentIds - QMS Document UUIDs (deduped by caller)
 * @param {{ generatedBy?: string, source?: string, toolVersion?: string,
 *           reviewPeriodStart?: string, reviewPeriodEnd?: string,
 *           issuerClientId?: string, issuerService?: string,
 *           issuerUrl?: string, gitSha?: string }} [opts]
 * @returns {Promise<{ manifest: object|null, warnings: string[] }>}
 */
export async function buildQmsGovernanceManifestFromDocumentIds(documentIds, opts = {}) {
  const generatedBy = opts.generatedBy ?? 'qms-server';
  const source = opts.source ?? 'qms_document_control';
  const toolVersion = opts.toolVersion ?? '1.1.0-qms';
  const issuerClientId = opts.issuerClientId ?? 'mactech-qms-manifest-issuer';
  const issuerService = opts.issuerService ?? 'qms';
  const issuerUrl = opts.issuerUrl ?? 'https://quality.mactechsolutionsllc.com';
  const gitSha = opts.gitSha;

  const platformRows = await prisma.governanceControlMapping.findMany();
  const platformMap = new Map(platformRows.map((r) => [r.documentNumber, r.controlIds]));

  const warnings = [];
  const documents = [];
  const controlsTouchedSet = new Set();
  const byType = {};

  for (const id of documentIds) {
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        documentId: true,
        title: true,
        documentType: true,
        versionMajor: true,
        versionMinor: true,
        status: true,
        content: true,
        effectiveDate: true,
        nextReviewDate: true,
      },
    });
    if (!document) {
      warnings.push(`Document not found: ${id}`);
      continue;
    }

    const content = document.content ?? '';
    const sha256 = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
    const fileSizeBytes = Buffer.byteLength(content, 'utf8');
    const version = `${document.versionMajor}.${document.versionMinor}`;
    const manifestType = qmsDocumentTypeToManifestType(document.documentType);
    byType[manifestType] = (byType[manifestType] || 0) + 1;

    const { ids: controlsMapped, source: controlsSource } = await resolveControlsFor(
      document,
      platformMap,
    );
    if (controlsSource === 'none') {
      warnings.push(`No control mapping for ${document.documentId}`);
    }
    for (const c of controlsMapped) controlsTouchedSet.add(c);

    const eff = document.effectiveDate
      ? new Date(document.effectiveDate).toISOString().slice(0, 10)
      : null;
    const nextReview = document.nextReviewDate
      ? new Date(document.nextReviewDate).toISOString().slice(0, 10)
      : null;

    documents.push({
      document_number: document.documentId,
      document_name: document.title,
      document_type: manifestType,
      file_path: `qms/documents/${document.documentId}/v${version}.html`,
      version,
      effective_date: eff,
      next_review_date: nextReview,
      status: mapDocumentStatusToManifest(document.status),
      sha256,
      file_size_bytes: fileSizeBytes,
      controls_mapped: [...controlsMapped].sort(),
    });
  }

  if (!documents.length) {
    return { manifest: null, warnings };
  }

  const runId = newGovernanceRunId();
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const controls_touched = Array.from(controlsTouchedSet).sort();
  const doc_count = documents.length;

  const content_hash = computeContentHash({
    run_id: runId,
    generated_at: generatedAt,
    source,
    documents,
    controls_touched,
    doc_count,
  });
  const signing_hash = computeSigningHash({
    content_hash,
    run_id: runId,
    generated_at: generatedAt,
    issuer_client_id: issuerClientId,
  });
  const signature_obj = signHmac(signing_hash);
  if (!signature_obj.value) {
    warnings.push(
      'QMS_MANIFEST_SIGNING_SECRET not set — manifest is unsigned and will be rejected by codex',
    );
  }

  let governanceDocCount = 0;
  let supportingDocCount = 0;
  const coverageControlSet = new Set();
  for (const d of documents) {
    if (GOVERNANCE_TYPES.has(d.document_type)) {
      governanceDocCount++;
      for (const c of d.controls_mapped) coverageControlSet.add(c);
    } else {
      supportingDocCount++;
    }
  }

  // v1.1 envelope. Order of top-level keys is unimportant on the wire
  // (canonicalize sorts), but we keep human-readable groupings here.
  const manifest = {
    schema: 'mactech-governance-manifest.v1.1',
    generated_at: generatedAt,
    generated_by: generatedBy,
    tool_version: toolVersion,
    run_id: runId,
    base_path: 'qms://document-control',
    source,

    issuer: {
      service: issuerService,
      url: issuerUrl,
      client_id: issuerClientId,
      ...(gitSha ? { git_sha: gitSha } : {}),
    },

    ...(opts.reviewPeriodStart ? { review_period_start: opts.reviewPeriodStart } : {}),
    ...(opts.reviewPeriodEnd ? { review_period_end: opts.reviewPeriodEnd } : {}),

    documents,

    controls_touched,
    doc_count,

    content_hash,
    signing_hash,
    signature: {
      alg: 'HMAC-SHA256',
      kid: signature_obj.kid,
      value: signature_obj.value,
    },

    summary: {
      total_documents: documents.length,
      hash_algorithm: 'SHA-256',
      controls_mapped_total: documents.reduce((n, d) => n + d.controls_mapped.length, 0),
      unique_controls_covered: controls_touched.length,
      unique_controls_governance_coverage: coverageControlSet.size,
      governance_documents: governanceDocCount,
      supporting_documents: supportingDocCount,
      by_type: byType,
    },
    warnings: warnings.length ? warnings : undefined,
  };

  return { manifest, warnings };
}
