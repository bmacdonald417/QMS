/**
 * Inbound bridge authentication: shared-secret Bearer + HMAC-SHA256 signature.
 *
 * This is a different threat model from the existing integration-token JWT
 * flow (server/src/integrations/auth.js). That flow is for clients who
 * authenticate with credentials and exchange them for short-lived scoped
 * tokens. This middleware is for system-to-system bridges where both ends
 * share two pre-issued secrets and the inbound POST carries both a Bearer
 * token AND an HMAC signature over the raw request body.
 *
 * Mirrors the pattern used by the analogous Codex-side bridges
 * (CA bundles, IR tabletop bundles, RA envelopes — see Codex repo
 * src/app/api/{ca-assessments,ir-tabletop,risk-assessments}/...).
 *
 * USAGE
 *
 *   import express from 'express';
 *   import { inboundBridgeAuth } from './lib/inboundBridgeAuth.js';
 *
 *   router.post(
 *     '/ssp',
 *     express.raw({ type: 'application/json', limit: '20mb' }),
 *     inboundBridgeAuth({
 *       tokenEnv: 'SSP_BRIDGE_TOKEN',
 *       hmacEnv:  'SSP_BRIDGE_HMAC',
 *     }),
 *     async (req, res) => {
 *       const parsed = req.parsedJson;  // already parsed from verified bytes
 *       …
 *     },
 *   );
 *
 * The express.raw() upstream is required: HMAC must be computed over the
 * exact bytes the sender signed. We then JSON.parse those same bytes once
 * and stash on req.parsedJson so handlers don't re-derive.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * @typedef {object} InboundBridgeAuthOptions
 * @property {string} tokenEnv - Env var name holding the Bearer token
 * @property {string} hmacEnv - Env var name holding the HMAC shared secret
 * @property {string} [signatureHeader] - Header to read signature from (default: x-codex-signature)
 */

/**
 * Build an Express middleware that verifies a bridge-protocol POST.
 * @param {InboundBridgeAuthOptions} options
 */
export function inboundBridgeAuth({ tokenEnv, hmacEnv, signatureHeader = 'x-codex-signature' }) {
  return function inboundBridgeAuthMiddleware(req, res, next) {
    // Env vars resolved at request time so misconfiguration logs every request,
    // not just at boot. Both required.
    const expectedToken = process.env[tokenEnv];
    const sharedSecret = process.env[hmacEnv];
    if (!expectedToken || !sharedSecret) {
      console.error(
        `[inboundBridgeAuth] Configuration error: ${!expectedToken ? tokenEnv : ''}${
          !expectedToken && !sharedSecret ? ' and ' : ''
        }${!sharedSecret ? hmacEnv : ''} not set in env`,
      );
      return res.status(500).json({ error: 'internal_error', message: 'Bridge not configured' });
    }

    // 1. Bearer token
    const authHeader = req.headers.authorization;
    const presented = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    if (!presented) {
      return res.status(401).json({ error: 'unauthorized_token', message: 'Missing Bearer token' });
    }
    if (!constantTimeStringEquals(presented, expectedToken)) {
      return res.status(401).json({ error: 'unauthorized_token', message: 'Invalid Bearer token' });
    }

    // 2. HMAC over raw bytes. express.raw() must run upstream; req.body is a Buffer.
    if (!Buffer.isBuffer(req.body)) {
      console.error(
        '[inboundBridgeAuth] Configuration error: req.body is not a Buffer. Did you forget express.raw() upstream?',
      );
      return res.status(500).json({ error: 'internal_error', message: 'Bridge not configured' });
    }

    const signatureRaw = req.headers[signatureHeader];
    const signatureValue = typeof signatureRaw === 'string' ? signatureRaw : null;
    if (!signatureValue || !signatureValue.startsWith('sha256=')) {
      return res.status(403).json({
        error: 'invalid_signature',
        message: `Missing or malformed ${signatureHeader} header (expected "sha256=<hex>")`,
      });
    }
    const presentedHex = signatureValue.slice(7).trim();
    if (!/^[0-9a-f]+$/i.test(presentedHex) || presentedHex.length !== 64) {
      return res.status(403).json({
        error: 'invalid_signature',
        message: 'Signature must be 64 hex chars',
      });
    }

    const computedHex = createHmac('sha256', sharedSecret).update(req.body).digest('hex');
    if (!constantTimeStringEquals(presentedHex.toLowerCase(), computedHex)) {
      return res.status(403).json({ error: 'invalid_signature', message: 'HMAC mismatch' });
    }

    // 3. Parse JSON exactly once, from the verified bytes. Handlers MUST use
    //    req.parsedJson rather than re-reading or re-stringifying — otherwise
    //    a malicious encoder could pass HMAC verification with one payload and
    //    have the handler operate on a different decode of the same bytes.
    let parsed;
    try {
      parsed = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      return res.status(400).json({
        error: 'invalid_payload',
        message: `Body is not valid JSON: ${err.message}`,
      });
    }
    req.parsedJson = parsed;

    // Stash actor info for downstream audit logs.
    req.bridgeActor = {
      type: 'BRIDGE',
      tokenEnv,
      signatureHeader,
    };

    next();
  };
}

/**
 * Length-safe constant-time string comparison. Returns false (without leaking
 * the length difference via timing) when lengths differ, true only when bytes
 * are byte-for-byte equal.
 */
function constantTimeStringEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // timingSafeEqual requires same length. Compare lengths first via a dummy
  // compare of the longer string to itself, so the timing of mismatched
  // lengths is at least vaguely uniform.
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Run a fixed-length compare to keep the call site's timing roughly stable.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export const __test_internals = {
  constantTimeStringEquals,
};
