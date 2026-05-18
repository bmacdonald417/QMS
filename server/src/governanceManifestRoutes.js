/**
 * Trust Codex governance manifest routes.
 *
 * Two flows on the QMS side:
 *
 * 1. **Self-ingest** (Brian's original) — POST /ingest-manifest accepts a
 *    pre-built manifest JSON and records the run for QMS-internal audit
 *    visibility. POST /manifest-preview parses without persisting. GET
 *    /manifest-runs/latest + GET /ssp-manifest-status surface history.
 *
 * 2. **Push-to-codex** (v1.1) — POST /push-to-codex builds a fresh
 *    signed v1.1 manifest from the live QMS state, records the run,
 *    POSTs to codex's /api/integrations/qms-manifest/ingest, and stamps
 *    the run with the codex push outcome. Required env:
 *    QMS_MANIFEST_SIGNING_SECRET.
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { authMiddleware } from './auth.js';
import {
  requireIntegrationScope,
  checkLegacyIntegrationKey,
} from './integrations/auth.js';
import { createAuditLog } from './audit.js';
import { buildQmsGovernanceManifestFromDocumentIds } from './lib/buildQmsGovernanceManifest.js';
import { pushManifestToCodex } from './lib/codexManifestClient.js';

const router = express.Router();
const LEGACY_KEY = process.env.INTEGRATION_KEY || '';

const GOVERNANCE_DOC_TYPES = new Set(['policy', 'procedure', 'plan', 'ssp', 'security_guide']);

function governanceWriteLike(req, res, next) {
  const scopeMw = requireIntegrationScope('governance:write');
  scopeMw(req, res, (err) => {
    if (!err && req.integration) {
      req.governanceActor = 'integration';
      return next();
    }
    if (checkLegacyIntegrationKey(req, LEGACY_KEY)) {
      req.governanceActor = 'integration';
      return next();
    }
    authMiddleware(req, res, () => {
      req.governanceActor = 'user';
      next();
    });
  });
}

// Aligns with QMS's existing canonical role catalog (Manager, Quality Manager,
// Read-Only, System Admin, User) and permission codes shown at /system/roles.
// Releasing a document = same authority as releasing through the QMS quality-
// release flow → guard on `document:release`. System Admin role is permitted
// regardless of permission set because it bypasses fine-grained checks
// system-wide.
function requireManifestIngestAccess(req, res, next) {
  if (req.governanceActor === 'integration') return next();
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = (req.user.roleName || '').trim();
  const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
  if (role === 'System Admin') return next();
  if (permissions.includes('document:release')) return next();
  return res.status(403).json({
    error:
      'Governance manifest release requires the document:release permission ' +
      '(Quality Manager or System Admin role).',
  });
}

function parseLocalDate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Priority: (1) platform mapping row if present (2) else manifest.controls_mapped */
function resolveControls(documentNumber, platformMap, manifestDoc) {
  if (platformMap.has(documentNumber)) {
    const ids = platformMap.get(documentNumber);
    return {
      ids: Array.isArray(ids) ? [...ids] : [],
      source: ids?.length ? 'platform_mapping' : 'platform_mapping',
    };
  }
  const m = Array.isArray(manifestDoc.controls_mapped) ? manifestDoc.controls_mapped : [];
  return { ids: [...m], source: m.length ? 'manifest_fallback' : 'none' };
}

async function buildPreviewWithDb(manifest) {
  const docs = Array.isArray(manifest.documents) ? manifest.documents : [];
  const platformRows = await prisma.governanceControlMapping.findMany();
  const platformMap = new Map(platformRows.map((r) => [r.documentNumber, r.controlIds]));

  let gov = 0;
  let sup = 0;
  const controlSet = new Set();
  const overdue = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const d of docs) {
    const documentNumber = String(d.document_number || '');
    const t = String(d.document_type || '').toLowerCase();
    const isGov = GOVERNANCE_DOC_TYPES.has(t);
    if (isGov) gov++;
    else sup++;

    const { ids } = resolveControls(documentNumber, platformMap, d);
    if (isGov) {
      for (const c of ids) {
        if (c) controlSet.add(String(c));
      }
    }

    const nr = parseLocalDate(d.next_review_date);
    if (nr && nr < today) {
      overdue.push(documentNumber);
    }
  }

  return {
    documents_in_manifest: docs.length,
    governance_documents: gov,
    supporting_documents: sup,
    unique_controls_in_manifest: controlSet.size,
    overdue_for_review: overdue,
  };
}

router.post('/ingest-manifest', governanceWriteLike, requireManifestIngestAccess, async (req, res) => {
  try {
    const manifest = req.body;
    if (!manifest || typeof manifest !== 'object') {
      return res.status(400).json({ error: 'JSON manifest body required' });
    }
    const schema = manifest.schema;
    // Accept v1 (Brian's CLI emits this) and v1.1 (in-server builder
    // emits this with the chain-of-custody envelope). Codex push uses
    // v1.1 only; self-ingest accepts both for backward compat.
    if (
      schema &&
      schema !== 'mactech-governance-manifest.v1' &&
      schema !== 'mactech-governance-manifest.v1.1'
    ) {
      return res.status(400).json({ error: `Unsupported schema: ${schema}` });
    }
    const runId = manifest.run_id || manifest.runId;
    if (!runId || typeof runId !== 'string') {
      return res.status(400).json({ error: 'manifest.run_id is required' });
    }

    const existingRun = await prisma.governanceManifestRun.findUnique({ where: { runId } });
    if (existingRun) {
      return res.status(409).json({ error: 'This manifest run_id was already ingested', run_id: runId });
    }

    const platformRows = await prisma.governanceControlMapping.findMany();
    const platformMap = new Map(platformRows.map((r) => [r.documentNumber, r.controlIds]));

    const docs = Array.isArray(manifest.documents) ? manifest.documents : [];
    const ingestLog = {
      no_controls_mapped: [],
      manifest_fallback_used: [],
      not_in_cmmc_library: [],
      warnings: [],
    };

    const reviewOverdue = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const hashRows = [];
    const allControls = new Set();
    let governanceCount = 0;
    let supportingCount = 0;

    const cmmcCodes = new Set(
      (await prisma.cmmcDocument.findMany({ select: { code: true } })).map((c) => c.code)
    );

    for (const d of docs) {
      const documentNumber = String(d.document_number || '');
      const docType = String(d.document_type || 'reference').toLowerCase();
      const countsToward = GOVERNANCE_DOC_TYPES.has(docType);
      if (countsToward) governanceCount++;
      else supportingCount++;

      const { ids: controlsResolved, source } = resolveControls(documentNumber, platformMap, d);
      if (controlsResolved.length === 0) {
        ingestLog.no_controls_mapped.push(documentNumber);
      }
      if (source === 'manifest_fallback') {
        ingestLog.manifest_fallback_used.push(documentNumber);
      }
      if (!cmmcCodes.has(documentNumber)) {
        ingestLog.not_in_cmmc_library.push(documentNumber);
        ingestLog.warnings.push(`Document ${documentNumber} not found in CMMC document library (cmmc_documents)`);
      }

      const nr = parseLocalDate(d.next_review_date);
      if (nr && nr < today) {
        reviewOverdue.push({
          document_number: documentNumber,
          next_review_date: d.next_review_date,
        });
      }

      if (countsToward) {
        for (const cid of controlsResolved) {
          allControls.add(cid);
        }
      }

      const rowId = randomUUID();
      hashRows.push({
        id: rowId,
        documentNumber,
        documentName: d.document_name ?? null,
        documentType: docType,
        filePath: d.file_path ?? null,
        version: d.version ?? null,
        sha256: String(d.sha256 || ''),
        fileSizeBytes: d.file_size_bytes ?? null,
        effectiveDate: d.effective_date ?? null,
        nextReviewDate: d.next_review_date ?? null,
        status: d.status ?? null,
        inPlatformLibrary: cmmcCodes.has(documentNumber),
        controlsSource: source,
        controlsResolved,
        countsTowardCoverage: countsToward,
      });
    }

    const flatLinks = [];
    for (const h of hashRows) {
      for (const cid of h.controlsResolved) {
        flatLinks.push({
          id: randomUUID(),
          runId: null,
          controlId: cid,
          documentNumber: h.documentNumber,
          policyDocStatus: 'satisfied',
          source: h.controlsSource,
        });
      }
    }

    const userId = req.user?.id ?? null;

    const runDbId = randomUUID();
    const createdAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.governanceManifestRun.create({
        data: {
          id: runDbId,
          runId,
          manifestSchema: schema || 'mactech-governance-manifest.v1',
          generatedAt: manifest.generated_at ? new Date(manifest.generated_at) : createdAt,
          generatedBy: manifest.generated_by ?? null,
          toolVersion: manifest.tool_version ?? null,
          basePath: manifest.base_path ?? null,
          documentsTotal: docs.length,
          governanceDocCount: governanceCount,
          supportingDocCount: supportingCount,
          uniqueControlsCovered: allControls.size,
          reviewOverdue,
          ingestLog,
          createdByUserId: userId,
        },
      });

      await tx.governanceDocumentHash.createMany({
        data: hashRows.map((h) => ({
          id: h.id,
          runId: runDbId,
          documentNumber: h.documentNumber,
          documentName: h.documentName,
          documentType: h.documentType,
          filePath: h.filePath,
          version: h.version,
          sha256: h.sha256,
          fileSizeBytes: h.fileSizeBytes,
          effectiveDate: h.effectiveDate,
          nextReviewDate: h.nextReviewDate,
          status: h.status,
          inPlatformLibrary: h.inPlatformLibrary,
          controlsSource: h.controlsSource,
          controlsResolved: h.controlsResolved,
          countsTowardCoverage: h.countsTowardCoverage,
        })),
      });

      if (flatLinks.length) {
        await tx.governanceControlLink.createMany({
          data: flatLinks.map((l) => ({ ...l, runId: runDbId })),
        });
      }
    });

    await createAuditLog({
      userId,
      actorType: req.governanceActor === 'integration' ? 'INTEGRATION' : 'USER',
      actorId: req.integration?.clientId ?? null,
      integration: req.integration ?? null,
      action: 'GOVERNANCE_MANIFEST_INGESTED',
      entityType: 'GovernanceManifestRun',
      entityId: runDbId,
      afterValue: {
        runId,
        documentsTotal: docs.length,
        uniqueControlsCovered: allControls.size,
        governanceDocCount: governanceCount,
        supportingDocCount: supportingCount,
      },
      requestId: req.requestId ?? null,
      ip: req.ip ?? null,
      userAgent: req.get?.('user-agent') ?? null,
    });

    const ssp = hashRows.find((h) => h.documentNumber === 'MAC-IT-304');

    return res.status(201).json({
      ok: true,
      run_id: runId,
      id: runDbId,
      documents_processed: docs.length,
      governance_documents: governanceCount,
      supporting_documents: supportingCount,
      unique_controls_covered: allControls.size,
      control_links_created: flatLinks.length,
      review_overdue: reviewOverdue,
      ingest_summary: ingestLog,
      ssp: ssp
        ? {
            verified_via_manifest: true,
            document_number: 'MAC-IT-304',
            version: ssp.version,
            sha256: ssp.sha256,
            file_path: ssp.filePath,
            policy_doc_status: 'satisfied',
            control_3_12_4_linked: (ssp.controlsResolved || []).includes('3.12.4'),
          }
        : null,
    });
  } catch (err) {
    console.error('ingest-manifest error:', err);
    return res.status(500).json({ error: err.message || 'Ingest failed' });
  }
});

router.post('/manifest-preview', governanceWriteLike, requireManifestIngestAccess, async (req, res) => {
  try {
    const manifest = req.body;
    if (!manifest || typeof manifest !== 'object') {
      return res.status(400).json({ error: 'JSON manifest body required' });
    }
    const p = await buildPreviewWithDb(manifest);
    return res.json(p);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Preview failed' });
  }
});

router.get('/manifest-runs/latest', governanceWriteLike, requireManifestIngestAccess, async (req, res) => {
  try {
    const run = await prisma.governanceManifestRun.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        documentHashes: { take: 200 },
        controlLinks: { take: 500 },
      },
    });
    if (!run) return res.json({ run: null });
    return res.json({ run });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load run' });
  }
});

router.get('/ssp-manifest-status', governanceWriteLike, requireManifestIngestAccess, async (req, res) => {
  try {
    const run = await prisma.governanceManifestRun.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!run) {
      return res.json({ verified: false, message: 'No governance manifest ingested yet' });
    }
    const ssp = await prisma.governanceDocumentHash.findFirst({
      where: { runId: run.id, documentNumber: 'MAC-IT-304' },
    });
    if (!ssp) {
      return res.json({ verified: false, message: 'MAC-IT-304 not in latest manifest run' });
    }
    return res.json({
      verified: true,
      run_id: run.runId,
      document_number: 'MAC-IT-304',
      version: ssp.version,
      sha256: ssp.sha256,
      file_path: ssp.filePath,
      file_size_bytes: ssp.fileSizeBytes,
      controls_linked: ssp.controlsResolved,
      banner: {
        title: 'System Security Plan verified via governance manifest',
        body: `Your System Security Plan (MAC-IT-304${ssp.version ? ` v${ssp.version}` : ''}) has been verified via governance manifest. SHA-256: ${ssp.sha256?.slice(0, 12)}… The SSP document path in the bundle: ${ssp.filePath || '(see manifest)'}. To populate SSP sections in Trust Codex, use the MacTech SSP template or author sections manually.`,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /push-to-codex — v1.1 build + sign + ship to codex.
//
// Body: { documentIds?: string[], reviewPeriodStart?: ISO, reviewPeriodEnd?: ISO }
//   - documentIds: optional. If omitted, defaults to all governance-typed
//     Documents (POLICY/SOP/WORK_INSTRUCTION/INCIDENT_RESPONSE_PLAN/
//     CONFIGURATION_MANAGEMENT_PLAN/IT_SYSTEM/SECURITY/AUDIT_ASSESSMENT)
//     for the canonical org.
//   - review_period_*: optional ISO timestamps included in envelope.
//
// Records a GovernanceManifestRun row regardless of push outcome (CMMC
// 3.3.4 — failed pushes are auditable too). On 5xx from codex, the
// codexManifestClient retries 3× with backoff before marking failed.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/push-to-codex',
  governanceWriteLike,
  requireManifestIngestAccess,
  async (req, res) => {
    try {
      const body = req.body ?? {};
      let documentIds = Array.isArray(body.documentIds)
        ? body.documentIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
        : null;

      // Default: all governance-typed Documents.
      if (!documentIds) {
        const rows = await prisma.document.findMany({
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
          select: { id: true },
          orderBy: { documentId: 'asc' },
        });
        documentIds = rows.map((r) => r.id);
      }

      if (documentIds.length === 0) {
        return res.status(400).json({ error: 'no documents to manifest' });
      }

      const { manifest, warnings } = await buildQmsGovernanceManifestFromDocumentIds(
        [...new Set(documentIds)],
        {
          generatedBy: req.user?.email || 'qms-server',
          reviewPeriodStart: body.reviewPeriodStart,
          reviewPeriodEnd: body.reviewPeriodEnd,
        },
      );
      if (!manifest) {
        return res.status(400).json({ error: 'failed to build manifest', warnings });
      }
      if (!manifest.signature?.value) {
        return res.status(503).json({
          error: 'QMS_MANIFEST_SIGNING_SECRET not configured — manifest cannot be signed',
          warnings,
        });
      }

      // Record the run on QMS side BEFORE shipping. Push outcome stamps
      // the row after the response. This way a codex outage still leaves
      // a "we tried, it failed" audit trail.
      const runDbId = randomUUID();
      const userId = req.user?.id ?? null;
      await prisma.governanceManifestRun.create({
        data: {
          id: runDbId,
          runId: manifest.run_id,
          manifestSchema: manifest.schema,
          generatedAt: new Date(manifest.generated_at),
          generatedBy: manifest.generated_by ?? null,
          toolVersion: manifest.tool_version ?? null,
          basePath: manifest.base_path ?? null,
          documentsTotal: manifest.documents.length,
          governanceDocCount: manifest.summary?.governance_documents ?? 0,
          supportingDocCount: manifest.summary?.supporting_documents ?? 0,
          uniqueControlsCovered: manifest.controls_touched.length,
          reviewOverdue: [],
          ingestLog: { warnings: warnings ?? [] },
          contentHash: manifest.content_hash,
          signingHash: manifest.signing_hash,
          signatureKid: manifest.signature.kid,
          createdByUserId: userId,
        },
      });

      // Push. Forward the user's Clerk JWT so Codex can resolve the org
      // automatically by org_id claim — no CODEX_ORG_TOKEN env var needed.
      const rawAuth = req.headers['authorization'] ?? '';
      const clerkJwt =
        rawAuth.startsWith('Bearer eyJ') ? rawAuth.slice(7) : undefined;
      const push = await pushManifestToCodex(manifest, { clerkJwt });

      // Stamp run with push outcome.
      await prisma.governanceManifestRun.update({
        where: { id: runDbId },
        data: {
          codexPushedAt: new Date(),
          codexPushStatus: push.status,
          codexPushError: push.error ?? null,
        },
      });

      await createAuditLog({
        userId,
        actorType: req.governanceActor === 'integration' ? 'INTEGRATION' : 'USER',
        actorId: req.integration?.clientId ?? null,
        integration: req.integration ?? null,
        action: 'GOVERNANCE_MANIFEST_PUSHED',
        entityType: 'GovernanceManifestRun',
        entityId: runDbId,
        afterValue: {
          run_id: manifest.run_id,
          codex_push_status: push.status,
          codex_http_status: push.httpStatus ?? null,
          attempts: push.attempts,
          doc_count: manifest.doc_count,
          controls_touched_count: manifest.controls_touched.length,
        },
        requestId: req.requestId ?? null,
        ip: req.ip ?? null,
        userAgent: req.get?.('user-agent') ?? null,
      });

      const httpStatus = push.status === 'failed' ? 502 : 200;
      return res.status(httpStatus).json({
        run_id: manifest.run_id,
        codex_push_status: push.status,
        codex_http_status: push.httpStatus,
        codex_error: push.error,
        attempts: push.attempts,
        controls_touched: manifest.controls_touched,
        doc_count: manifest.doc_count,
        warnings: warnings.length ? warnings : undefined,
      });
    } catch (err) {
      console.error('push-to-codex error:', err);
      return res.status(500).json({ error: err.message || 'Push failed' });
    }
  },
);

export default router;
