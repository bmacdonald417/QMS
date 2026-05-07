/**
 * Integration token auth: mint, verify, and middleware for scoped JWT tokens.
 * Uses INTEGRATION_JWT_SECRET (separate from user JWT_SECRET).
 */

import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { authMiddleware } from '../auth.js';
import { hasScopes } from './scopes.js';

const INTEGRATION_JWT_SECRET = process.env.INTEGRATION_JWT_SECRET || '';
const INTEGRATION_TOKEN_TTL_MINUTES = Number(process.env.INTEGRATION_TOKEN_TTL_MINUTES) || 10;

/** Check if integration auth is enabled (secret configured). */
export function isIntegrationAuthEnabled() {
  return Boolean(INTEGRATION_JWT_SECRET);
}

/**
 * Mint a short-lived integration JWT.
 * @param {{ clientId: string, scopes: string[], onBehalfOfUserId?: string }} opts
 * @returns {string} Signed JWT
 */
export function mintIntegrationToken({ clientId, scopes, onBehalfOfUserId }) {
  if (!INTEGRATION_JWT_SECRET) {
    throw new Error('Integration auth is disabled: INTEGRATION_JWT_SECRET not set');
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + INTEGRATION_TOKEN_TTL_MINUTES * 60;
  const payload = {
    typ: 'integration',
    cid: clientId,
    scp: Array.isArray(scopes) ? scopes : [],
    sub: `integration:${clientId}`,
    iat: now,
    exp,
  };
  if (onBehalfOfUserId) {
    payload.obo = onBehalfOfUserId;
  }
  return jwt.sign(payload, INTEGRATION_JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Verify integration token. Returns decoded payload or null.
 * @param {string} token
 * @returns {{ cid: string, scp: string[], obo?: string } | null}
 */
export function verifyIntegrationToken(token) {
  if (!INTEGRATION_JWT_SECRET || !token) return null;
  try {
    const decoded = jwt.verify(token, INTEGRATION_JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded?.typ !== 'integration' || !decoded?.cid) return null;
    return {
      cid: decoded.cid,
      scp: Array.isArray(decoded.scp) ? decoded.scp : [],
      obo: decoded.obo || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Extract integration token from request.
 * Accepts: Authorization: Bearer <token> or X-INTEGRATION-TOKEN header.
 */
export function getIntegrationTokenFromRequest(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const headerToken = req.headers['x-integration-token'];
  if (headerToken && typeof headerToken === 'string') {
    return headerToken.trim();
  }
  return null;
}

/**
 * Middleware: require integration scope. Use with dual-auth (JWT or integration token).
 * If integration token present and valid with required scope, sets req.integration and calls next.
 * Otherwise delegates to next (caller should chain with authMiddleware for JWT fallback).
 *
 * @param {string} requiredScope - e.g. 'formrecords:read'
 * @returns {(req, res, next) => void}
 */
export function requireIntegrationScope(requiredScope) {
  return (req, res, next) => {
    const token = getIntegrationTokenFromRequest(req);
    if (!token) return next(); // No integration token; let JWT auth handle it

    const decoded = verifyIntegrationToken(token);
    if (!decoded) {
      // The bearer token didn't validate as an integration token. It may
      // still be a Clerk user JWT — defer to the next middleware so the
      // caller's JWT-fallback chain (authMiddleware) gets a turn. This
      // matches the documented contract: "Otherwise delegates to next
      // (caller should chain with authMiddleware for JWT fallback)."
      return next();
    }

    if (!decoded.scp.includes(requiredScope)) {
      return res.status(403).json({ error: `Missing integration scope: ${requiredScope}` });
    }

    req.integration = {
      clientId: decoded.cid,
      scopes: decoded.scp,
      onBehalfOfUserId: decoded.obo,
    };
    return next();
  };
}

/**
 * Middleware: require one of the given scopes.
 */
export function requireAnyIntegrationScope(...requiredScopes) {
  return (req, res, next) => {
    const token = getIntegrationTokenFromRequest(req);
    if (!token) return next();

    const decoded = verifyIntegrationToken(token);
    if (!decoded) {
      // Same fallthrough as requireIntegrationScope — defer to next so a
      // Clerk JWT in the same Authorization header gets a turn at JWT auth.
      return next();
    }

    const hasRequired = requiredScopes.some((s) => decoded.scp.includes(s));
    if (!hasRequired) {
      return res.status(403).json({
        error: `Missing integration scope: one of [${requiredScopes.join(', ')}] required`,
      });
    }

    req.integration = {
      clientId: decoded.cid,
      scopes: decoded.scp,
      onBehalfOfUserId: decoded.obo,
    };
    return next();
  };
}

/**
 * Dual auth: JWT or integration token (with required scope).
 * Sets req.user (JWT) or req.integration (token). Never allows anonymous.
 *
 * @param {string} requiredScope - Scope required when using integration token
 */
export function dualAuth(requiredScope) {
  const scopeMiddleware = requireIntegrationScope(requiredScope);
  return (req, res, next) => {
    scopeMiddleware(req, res, (err) => {
      if (err) return next(err);
      if (req.integration) return next(); // Integration token valid
      // Fall back to JWT
      authMiddleware(req, res, next);
    });
  };
}

/**
 * Dual auth requiring one of the given scopes (for integration) or JWT.
 */
export function dualAuthAnyScope(...requiredScopes) {
  const scopeMiddleware = requireAnyIntegrationScope(...requiredScopes);
  return (req, res, next) => {
    scopeMiddleware(req, res, (err) => {
      if (err) return next(err);
      if (req.integration) return next();
      authMiddleware(req, res, next);
    });
  };
}

/**
 * Get auth actor for audit logs.
 * @param {object} req
 * @returns {{ actorType: 'USER'|'INTEGRATION', actorId: string, displayName?: string }}
 */
export function getAuthActor(req) {
  if (req.integration) {
    return {
      actorType: 'INTEGRATION',
      actorId: req.integration.clientId,
      displayName: `integration:${req.integration.clientId}`,
    };
  }
  if (req.user) {
    return {
      actorType: 'USER',
      actorId: req.user.id,
      displayName: req.user.email ? `${req.user.firstName} ${req.user.lastName}` : req.user.id,
    };
  }
  return { actorType: 'USER', actorId: 'unknown', displayName: null };
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/** Legacy integration key check (when ALLOW_LEGACY_INTEGRATION_KEY=true). */
export function checkLegacyIntegrationKey(req, envKey) {
  if (process.env.ALLOW_LEGACY_INTEGRATION_KEY !== 'true' || !envKey) return false;
  const key = req.headers['x-integration-key'];
  if (!key || !safeCompare(key, envKey)) return false;
  console.warn('[INTEGRATION] Legacy X-INTEGRATION-KEY used. Migrate to integration tokens.');
  return true;
}
