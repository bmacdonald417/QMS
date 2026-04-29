/**
 * MacTech Identity — Audit log client (drop-in, ESM, dependency-free).
 *
 * Sends a single audit event to the central Identity Command Center hub at
 * `${MACTECH_IDENTITY_BASE_URL}/api/audit/ingest`, authenticated with
 * `MACTECH_AUDIT_INGEST_API_KEY`. Schema mirrors the Zod schema defined in
 * mactech-suite-platform/lib/validations/audit.ts.
 *
 * Failures never throw upstream — they are logged via console.error so a
 * downstream outage in the Identity Command Center cannot take down the
 * QMS server.
 *
 * Usage:
 *
 *   import { sendAuditLog, sendAuditLogAsync } from './mactechAuditClient.js';
 *
 *   await sendAuditLog({
 *     payload: {
 *       appKey: 'quality',
 *       eventType: 'quality.document.published',
 *       eventCategory: 'evidence',
 *       severity: 'info',
 *       action: `Published document ${doc.title}`,
 *       actorClerkUserId: clerkUserId,
 *       actorEmail: req.user.email,
 *       resourceType: 'document',
 *       resourceId: String(doc.id),
 *       metadata: { revision: doc.revision },
 *     },
 *   });
 */

const DEFAULT_BASE_URL = 'https://www.suite.mactechsolutionsllc.com';

function resolveBaseUrl(explicit) {
  return explicit || process.env.MACTECH_IDENTITY_BASE_URL || DEFAULT_BASE_URL;
}

function resolveApiKey(explicit) {
  return explicit || process.env.MACTECH_AUDIT_INGEST_API_KEY;
}

export async function sendAuditLog(opts) {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const apiKey = resolveApiKey(opts.apiKey);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  if (!apiKey) {
    const msg = '[mactech-audit] MACTECH_AUDIT_INGEST_API_KEY is not configured; skipping send.';
    if (opts.throwOnError) throw new Error(msg);
    console.warn(msg);
    return { ok: false };
  }

  const url = new URL('/api/audit/ingest', baseUrl).toString();
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MacTech-Audit-Key': apiKey,
      },
      body: JSON.stringify(opts.payload),
      signal: opts.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const msg = `[mactech-audit] ${opts.payload.eventType} → ${res.status} ${text.slice(0, 200)}`;
      if (opts.throwOnError) throw new Error(msg);
      console.error(msg);
      return { ok: false };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: body.id };
  } catch (err) {
    if (opts.throwOnError) throw err;
    console.error(`[mactech-audit] send failed for ${opts.payload.eventType}:`, err);
    return { ok: false };
  }
}

export function sendAuditLogAsync(opts) {
  void sendAuditLog(opts);
}

/**
 * Tiny in-memory dedup helper. Used to keep "session opened" events down
 * to one per user per window. Per-process — not shared across replicas,
 * which is fine: worst case we fire one extra event per replica per window.
 */
const _dedupTimestamps = new Map();

export function shouldFireAuditOnce(key, windowMs) {
  const now = Date.now();
  const last = _dedupTimestamps.get(key);
  if (last && now - last < windowMs) return false;
  _dedupTimestamps.set(key, now);
  // Bound the map size loosely.
  if (_dedupTimestamps.size > 10000) {
    const cutoff = now - windowMs;
    for (const [k, v] of _dedupTimestamps.entries()) {
      if (v < cutoff) _dedupTimestamps.delete(k);
    }
  }
  return true;
}
