/**
 * Governance approval verification layer.
 * Does NOT modify existing QMS SHA-256 hashing/signing.
 * - Exposes qmsHash and recordVersion for signable records.
 * - SignatureRequest + SignatureArtifact for Governance workflow.
 * - Verify Governance Ed25519 signature; status VERIFIED / INVALID / STALE.
 */

import { createHash, verify } from 'node:crypto';
import { prisma } from './db.js';

const ENTITY_DOCUMENT = 'Document';
const ENTITY_FORM_RECORD = 'FormRecord';
const ENTITY_CAPA = 'CAPA';
const ENTITY_CHANGE_CONTROL = 'ChangeControl';

export const SIGNABLE_ENTITY_TYPES = [ENTITY_DOCUMENT, ENTITY_FORM_RECORD, ENTITY_CAPA, ENTITY_CHANGE_CONTROL];

function sha256(input) {
  return createHash('sha256').update(typeof input === 'string' ? input : JSON.stringify(input)).digest('hex');
}

/** Deterministic JSON: sort keys recursively for object values */
function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalJson);
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = canonicalJson(obj[k]);
  return out;
}

function canonicalString(obj) {
  return JSON.stringify(canonicalJson(obj));
}

/**
 * Build canonical payload string for a record (same as Governance must use).
 * Used for: 1) computing qmsHash, 2) verifying Ed25519 signature (Governance signs this string).
 */
export function buildCanonicalPayload(entityType, record) {
  switch (entityType) {
    case ENTITY_DOCUMENT: {
      const payload = {
        entityType: ENTITY_DOCUMENT,
        id: record.id,
        documentId: record.documentId,
        versionMajor: record.versionMajor,
        versionMinor: record.versionMinor,
        content: record.content ?? '',
      };
      return canonicalString(payload);
    }
    case ENTITY_FORM_RECORD: {
      const payload = {
        entityType: ENTITY_FORM_RECORD,
        id: record.id,
        recordNumber: record.recordNumber,
        templateDocumentId: record.templateDocumentId,
        templateCode: record.templateCode,
        templateVersionMajor: record.templateVersionMajor,
        templateVersionMinor: record.templateVersionMinor,
        status: record.status,
        payload: record.payload ?? {},
        finalizedAt: record.finalizedAt ? new Date(record.finalizedAt).toISOString() : null,
        recordVersion: record.recordVersion ?? 1,
      };
      return canonicalString(payload);
    }
    case ENTITY_CAPA: {
      const payload = {
        entityType: ENTITY_CAPA,
        id: record.id,
        capaId: record.capaId,
        status: record.status,
        title: record.title,
        description: record.description ?? '',
        updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
      };
      return canonicalString(payload);
    }
    case ENTITY_CHANGE_CONTROL: {
      const payload = {
        entityType: ENTITY_CHANGE_CONTROL,
        id: record.id,
        changeId: record.changeId,
        title: record.title,
        status: record.status,
        updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
      };
      return canonicalString(payload);
    }
    default:
      throw new Error(`Unknown entityType: ${entityType}`);
  }
}

/**
 * Compute qmsHash for a record (SHA-256 of canonical payload).
 */
export function computeQmsHash(entityType, record) {
  const payload = buildCanonicalPayload(entityType, record);
  return sha256(payload);
}

/**
 * Get recordVersion string for API exposure.
 */
export function getRecordVersion(entityType, record) {
  switch (entityType) {
    case ENTITY_DOCUMENT:
      return `${record.versionMajor}.${record.versionMinor}`;
    case ENTITY_FORM_RECORD:
      return String(record.recordVersion ?? 1);
    case ENTITY_CAPA:
      return record.updatedAt ? new Date(record.updatedAt).getTime().toString() : '0';
    case ENTITY_CHANGE_CONTROL:
      return record.updatedAt ? new Date(record.updatedAt).getTime().toString() : '0';
    default:
      return '0';
  }
}

const GOV_PUBLIC_KEY_ENV = 'GOV_ED25519_PUBLIC_KEY';

/**
 * Verify Governance Ed25519 signature.
 * - Recomputes canonical payload and qmsHash.
 * - Verifies signature over canonical payload using GOV_ED25519_PUBLIC_KEY.
 * - If artifact.qmsHash !== current record qmsHash → STALE.
 * Returns { status: 'VERIFIED' | 'INVALID' | 'STALE', verifiedAt }.
 */
export function verifyGovernanceSignature(artifact, record, entityType) {
  const now = new Date();
  const publicKeyPem = process.env[GOV_PUBLIC_KEY_ENV];
  if (!publicKeyPem || !artifact.signature) {
    return { status: 'INVALID', verifiedAt: now, reason: 'Missing GOV_ED25519_PUBLIC_KEY or artifact signature' };
  }

  const canonicalPayload = buildCanonicalPayload(entityType, record);
  const currentQmsHash = sha256(canonicalPayload);

  if (artifact.qmsHash !== currentQmsHash) {
    return { status: 'STALE', verifiedAt: now, reason: 'Record changed since signature (qmsHash mismatch)' };
  }

  try {
    const signatureBuffer = Buffer.from(artifact.signature, 'base64');
    const key = publicKeyPem.replace(/\\n/g, '\n');
    const ok = verify(null, Buffer.from(canonicalPayload, 'utf8'), key, signatureBuffer);
    if (ok) {
      return { status: 'VERIFIED', verifiedAt: now };
    }
  } catch (err) {
    return { status: 'INVALID', verifiedAt: now, reason: err?.message || 'Signature verification failed' };
  }
  return { status: 'INVALID', verifiedAt: now, reason: 'Signature verification failed' };
}

/**
 * Load latest SignatureArtifact for entityType/entityId and re-run verification.
 * Returns { artifact, record, verification: { status, verifiedAt, reason } } or null if no artifact.
 */
export async function getGovernanceApprovalStatus(entityType, entityId) {
  const artifact = await prisma.signatureArtifact.findFirst({
    where: { entityType, entityId },
    orderBy: { signedAt: 'desc' },
  });
  if (!artifact) return null;

  let record;
  switch (entityType) {
    case ENTITY_DOCUMENT:
      record = await prisma.document.findUnique({ where: { id: entityId } });
      break;
    case ENTITY_FORM_RECORD:
      record = await prisma.formRecord.findUnique({ where: { id: entityId } });
      break;
    case ENTITY_CAPA:
      record = await prisma.cAPA.findUnique({ where: { id: entityId } });
      break;
    case ENTITY_CHANGE_CONTROL:
      record = await prisma.changeControl.findUnique({ where: { id: entityId } });
      break;
    default:
      return { artifact, record: null, verification: { status: 'INVALID', verifiedAt: new Date(), reason: 'Unknown entity type' } };
  }

  if (!record) {
    return {
      artifact,
      record: null,
      verification: { status: 'INVALID', verifiedAt: new Date(), reason: 'Record not found' },
    };
  }

  const verification = verifyGovernanceSignature(artifact, record, entityType);

  if (verification.status !== (artifact.verificationStatus ?? undefined)) {
    await prisma.signatureArtifact.update({
      where: { id: artifact.id },
      data: {
        verificationStatus: verification.status,
        verifiedAt: verification.verifiedAt,
      },
    });
    artifact.verificationStatus = verification.status;
    artifact.verifiedAt = verification.verifiedAt;
  }

  return { artifact, record, verification };
}
