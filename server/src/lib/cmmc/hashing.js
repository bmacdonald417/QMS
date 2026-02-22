import { createHash } from 'node:crypto';
import { normalizeMarkdown, buildSigningPayload, canonicalizePayload } from './canonicalize.js';

/**
 * Compute SHA-256 hash of a string
 * @param {string} input
 * @returns {string} Hex hash
 */
export function sha256(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Compute content hash for markdown body
 * @param {string} markdownBody - Raw markdown body
 * @returns {string} Hex hash
 */
export function computeContentHash(markdownBody) {
  const normalized = normalizeMarkdown(markdownBody);
  return sha256(normalized);
}

/**
 * Compute manifest hash (hash of manifest fields only)
 * @param {Object} manifestFields - { code, title, kind, qmsDocType, reviewCadence }
 * @returns {string} Hex hash
 */
export function computeManifestHash(manifestFields) {
  const payload = {
    code: manifestFields.code,
    title: manifestFields.title,
    kind: manifestFields.kind,
    qmsDocType: manifestFields.qmsDocType,
    reviewCadence: manifestFields.reviewCadence || null,
  };
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return sha256(json);
}

/**
 * Compute signing hash from full signing payload
 * @param {Object} params - All fields for signing payload
 * @returns {Object} { hash, payload, canonicalJson }
 */
export function computeSigningHash(params) {
  const normalizedBody = normalizeMarkdown(params.normalizedMarkdownBody || params.body || '');
  const payload = buildSigningPayload({
    ...params,
    normalizedMarkdownBody: normalizedBody,
  });
  const canonicalJson = canonicalizePayload(payload);
  const hash = sha256(canonicalJson);

  return {
    hash,
    payload,
    canonicalJson,
  };
}

/**
 * Verify a signing hash against current document state
 * @param {string} expectedHash - Hash from signed revision
 * @param {Object} currentParams - Current document parameters
 * @returns {boolean} True if hash matches
 */
export function verifySigningHash(expectedHash, currentParams) {
  const { hash } = computeSigningHash(currentParams);
  return hash === expectedHash;
}