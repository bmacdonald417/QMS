/**
 * Governance API: signable-items, signature-requests, signature-artifacts, verify.
 * Auth: JWT or X-INTEGRATION-KEY (same as form records).
 */

import express from 'express';
import { prisma } from './db.js';
import { authMiddleware } from './auth.js';
import {
  SIGNABLE_ENTITY_TYPES,
  computeQmsHash,
  getRecordVersion,
  buildCanonicalPayload,
  verifyGovernanceSignature,
  getGovernanceApprovalStatus,
} from './governance.js';

const router = express.Router();
const INTEGRATION_KEY = process.env.INTEGRATION_KEY || '';

async function governanceAuth(req, res, next) {
  const integrationKey = req.headers['x-integration-key'];
  if (INTEGRATION_KEY && integrationKey === INTEGRATION_KEY) {
    req.governanceActor = 'integration';
    return next();
  }
  authMiddleware(req, res, () => {
    req.governanceActor = 'user';
    next();
  });
}

function requireGovernanceAccess(req, res, next) {
  if (req.governanceActor === 'integration') return next();
  if (req.governanceActor !== 'user' || !req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const allowed = ['System Admin', 'Quality Manager', 'Admin'];
  if (allowed.includes(req.user.roleName)) return next();
  return res.status(403).json({ error: 'Governance API requires System Admin or Quality Manager' });
}

// --- Signable items: list records with qmsHash and recordVersion ---

async function getSignableDocuments(limit = 100) {
  const docs = await prisma.document.findMany({
    where: { status: { in: ['EFFECTIVE', 'APPROVED', 'IN_REVIEW'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true, content: true, status: true },
  });
  return docs.map((d) => ({
    entityType: 'Document',
    entityId: d.id,
    title: d.title,
    documentId: d.documentId,
    recordVersion: getRecordVersion('Document', d),
    qmsHash: computeQmsHash('Document', d),
  }));
}

async function getSignableFormRecords(limit = 100) {
  const records = await prisma.formRecord.findMany({
    where: { status: 'FINAL' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { templateDocument: { select: { documentId: true } } },
  });
  return records.map((r) => ({
    entityType: 'FormRecord',
    entityId: r.id,
    title: r.title,
    recordNumber: r.recordNumber,
    templateCode: r.templateCode,
    recordVersion: getRecordVersion('FormRecord', r),
    qmsHash: r.qmsHash || computeQmsHash('FormRecord', r),
  }));
}

async function getSignableCapas(limit = 100) {
  const capas = await prisma.cAPA.findMany({
    where: { status: { in: ['CLOSED', 'PENDING_CLOSURE', 'IMPLEMENTATION'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, capaId: true, title: true, status: true, updatedAt: true },
  });
  return capas.map((c) => ({
    entityType: 'CAPA',
    entityId: c.id,
    title: c.title,
    capaId: c.capaId,
    recordVersion: getRecordVersion('CAPA', c),
    qmsHash: computeQmsHash('CAPA', c),
  }));
}

async function getSignableChangeControls(limit = 100) {
  const ccs = await prisma.changeControl.findMany({
    where: { status: { in: ['CLOSED', 'IMPLEMENTATION', 'PENDING_CLOSURE'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, changeId: true, title: true, status: true, updatedAt: true },
  });
  return ccs.map((c) => ({
    entityType: 'ChangeControl',
    entityId: c.id,
    title: c.title,
    changeId: c.changeId,
    recordVersion: getRecordVersion('ChangeControl', c),
    qmsHash: computeQmsHash('ChangeControl', c),
  }));
}

// GET /api/governance/signable-items?entityType=&limit=
router.get('/signable-items', governanceAuth, requireGovernanceAccess, async (req, res) => {
  try {
    const entityType = req.query.entityType;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    let items = [];
    const types = entityType ? [entityType] : SIGNABLE_ENTITY_TYPES;
    if (!entityType || entityType === 'Document') items = items.concat(await getSignableDocuments(limit));
    if (!entityType || entityType === 'FormRecord') items = items.concat(await getSignableFormRecords(limit));
    if (!entityType || entityType === 'CAPA') items = items.concat(await getSignableCapas(limit));
    if (!entityType || entityType === 'ChangeControl') items = items.concat(await getSignableChangeControls(limit));
    res.json({ items });
  } catch (err) {
    console.error('Governance signable-items error:', err);
    res.status(500).json({ error: 'Failed to list signable items' });
  }
});

// GET /api/governance/signature-requests?entityType=&entityId=&status=
router.get('/signature-requests', governanceAuth, requireGovernanceAccess, async (req, res) => {
  try {
    const { entityType, entityId, status } = req.query;
    const where = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (status) where.status = status;
    const requests = await prisma.signatureRequest.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take: 100,
      include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    res.json({ requests });
  } catch (err) {
    console.error('Governance signature-requests list error:', err);
    res.status(500).json({ error: 'Failed to list signature requests' });
  }
});

// POST /api/governance/signature-requests
router.post('/signature-requests', governanceAuth, requireGovernanceAccess, async (req, res) => {
  try {
    const { entityType, entityId, recordVersion, qmsHash, governanceRequestId, notes } = req.body || {};
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }
    if (!SIGNABLE_ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entityType' });
    }
    let record;
    switch (entityType) {
      case 'Document':
        record = await prisma.document.findUnique({ where: { id: entityId } });
        break;
      case 'FormRecord':
        record = await prisma.formRecord.findUnique({ where: { id: entityId } });
        break;
      case 'CAPA':
        record = await prisma.cAPA.findUnique({ where: { id: entityId } });
        break;
      case 'ChangeControl':
        record = await prisma.changeControl.findUnique({ where: { id: entityId } });
        break;
      default:
        return res.status(400).json({ error: 'Unknown entityType' });
    }
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const computedVersion = getRecordVersion(entityType, record);
    const computedHash = computeQmsHash(entityType, record);
    const finalVersion = recordVersion != null ? String(recordVersion) : computedVersion;
    const finalHash = qmsHash || computedHash;

    const request = await prisma.signatureRequest.create({
      data: {
        entityType,
        entityId,
        recordVersion: finalVersion,
        qmsHash: finalHash,
        status: 'PENDING',
        governanceRequestId: governanceRequestId || null,
        createdById: req.user?.id ?? null,
        notes: notes || null,
      },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json({ request });
  } catch (err) {
    console.error('Governance signature-request create error:', err);
    res.status(500).json({ error: 'Failed to create signature request' });
  }
});

// GET /api/governance/signature-artifacts?entityType=&entityId=
router.get('/signature-artifacts', governanceAuth, requireGovernanceAccess, async (req, res) => {
  try {
    const { entityType, entityId } = req.query;
    const where = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    const artifacts = await prisma.signatureArtifact.findMany({
      where,
      orderBy: { signedAt: 'desc' },
      take: 50,
    });
    res.json({ artifacts });
  } catch (err) {
    console.error('Governance signature-artifacts list error:', err);
    res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

// POST /api/governance/signature-artifacts — Governance submits a signed artifact
router.post('/signature-artifacts', governanceAuth, requireGovernanceAccess, async (req, res) => {
  try {
    const { entityType, entityId, recordVersion, qmsHash, signature, signedAt, signatureRequestId } = req.body || {};
    if (!entityType || !entityId || !recordVersion || !qmsHash || !signature) {
      return res.status(400).json({ error: 'entityType, entityId, recordVersion, qmsHash, and signature are required' });
    }
    if (!SIGNABLE_ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entityType' });
    }

    let record;
    switch (entityType) {
      case 'Document':
        record = await prisma.document.findUnique({ where: { id: entityId } });
        break;
      case 'FormRecord':
        record = await prisma.formRecord.findUnique({ where: { id: entityId } });
        break;
      case 'CAPA':
        record = await prisma.cAPA.findUnique({ where: { id: entityId } });
        break;
      case 'ChangeControl':
        record = await prisma.changeControl.findUnique({ where: { id: entityId } });
        break;
      default:
        return res.status(400).json({ error: 'Unknown entityType' });
    }
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const verification = verifyGovernanceSignature(
      { qmsHash, signature, recordVersion },
      record,
      entityType
    );

    const signedAtDate = signedAt ? new Date(signedAt) : new Date();
    const artifact = await prisma.signatureArtifact.create({
      data: {
        entityType,
        entityId,
        recordVersion,
        qmsHash,
        signature,
        signedAt: signedAtDate,
        signatureRequestId: signatureRequestId || null,
        verifiedAt: verification.verifiedAt,
        verificationStatus: verification.status,
      },
    });

    if (signatureRequestId) {
      await prisma.signatureRequest.updateMany({
        where: { id: signatureRequestId },
        data: { status: 'SIGNED', signedAt: signedAtDate },
      });
    }

    res.status(201).json({ artifact, verification: { status: verification.status, verifiedAt: verification.verifiedAt } });
  } catch (err) {
    console.error('Governance signature-artifact create error:', err);
    res.status(500).json({ error: 'Failed to store signature artifact' });
  }
});

// GET /api/governance/verify/:entityType/:entityId — get approval status (latest artifact + re-verify)
router.get('/verify/:entityType/:entityId', governanceAuth, requireGovernanceAccess, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    if (!SIGNABLE_ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entityType' });
    }
    const result = await getGovernanceApprovalStatus(entityType, entityId);
    if (!result) {
      return res.json({ hasArtifact: false, artifact: null, verification: null });
    }
    res.json({
      hasArtifact: true,
      artifact: {
        id: result.artifact.id,
        entityType: result.artifact.entityType,
        entityId: result.artifact.entityId,
        recordVersion: result.artifact.recordVersion,
        qmsHash: result.artifact.qmsHash,
        signedAt: result.artifact.signedAt,
        verifiedAt: result.artifact.verifiedAt,
        verificationStatus: result.artifact.verificationStatus,
      },
      verification: result.verification,
    });
  } catch (err) {
    console.error('Governance verify error:', err);
    res.status(500).json({ error: 'Failed to verify' });
  }
});

// GET /api/governance/canonical-payload/:entityType/:entityId — for Governance to get exact payload to sign (same as we verify)
router.get('/canonical-payload/:entityType/:entityId', governanceAuth, requireGovernanceAccess, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    if (!SIGNABLE_ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entityType' });
    }
    let record;
    switch (entityType) {
      case 'Document':
        record = await prisma.document.findUnique({ where: { id: entityId } });
        break;
      case 'FormRecord':
        record = await prisma.formRecord.findUnique({ where: { id: entityId } });
        break;
      case 'CAPA':
        record = await prisma.cAPA.findUnique({ where: { id: entityId } });
        break;
      case 'ChangeControl':
        record = await prisma.changeControl.findUnique({ where: { id: entityId } });
        break;
      default:
        return res.status(400).json({ error: 'Unknown entityType' });
    }
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const canonicalPayload = buildCanonicalPayload(entityType, record);
    const qmsHash = computeQmsHash(entityType, record);
    const recordVersion = getRecordVersion(entityType, record);
    res.json({ canonicalPayload, qmsHash, recordVersion });
  } catch (err) {
    console.error('Governance canonical-payload error:', err);
    res.status(500).json({ error: 'Failed to get canonical payload' });
  }
});

export default router;
