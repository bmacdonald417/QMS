/**
 * Outbound HTTP client for shipping signed QMS governance manifests to
 * Trust Codex.
 *
 *   POST https://codex.mactechsolutionsllc.com/api/integrations/qms-manifest/ingest
 *   body: <signed v1.1 envelope from buildQmsGovernanceManifest.js>
 *
 * Auth is in-body (envelope.signature). No Authorization header. Codex
 * verifies the signature against the shared QMS_MANIFEST_SIGNING_SECRET
 * and rejects on mismatch.
 *
 * Idempotent on run_id — re-POSTing the same manifest is a 200 with
 * status="already_present". Safe to retry without dedup tracking on
 * this side.
 *
 * Failure handling: 5xx triggers exponential-backoff retry up to 3
 * attempts (covers transient codex unavailability). 4xx is a hard
 * failure (signature mismatch, schema drift); no retry. Network errors
 * count as 5xx for retry purposes.
 *
 * Returns a typed result so callers can record codex_pushed_at +
 * codex_push_status on the GovernanceManifestRun row.
 */

const DEFAULT_BASE = 'https://codex.mactechsolutionsllc.com';
const RETRY_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * @typedef {Object} CodexPushResult
 * @property {'stored'|'already_present'|'failed'} status
 * @property {number=} httpStatus
 * @property {string=} error
 * @property {string[]=} controlsTouched
 * @property {number} attempts
 */

async function singleAttempt(envelope, baseUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/integrations/qms-manifest/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      signal: ctrl.signal,
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    return {
      ok: res.ok,
      httpStatus: res.status,
      retryable: res.status >= 500 && res.status < 600,
      body,
    };
  } catch (err) {
    // Network error or abort — treat as retryable.
    return {
      ok: false,
      httpStatus: undefined,
      retryable: true,
      body: null,
      networkError: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Push a signed manifest envelope to codex with retry-on-5xx.
 *
 * @param {object} envelope - the v1.1 envelope from buildQmsGovernanceManifest
 * @param {{ baseUrl?: string }} [opts]
 * @returns {Promise<CodexPushResult>}
 */
export async function pushManifestToCodex(envelope, opts = {}) {
  const baseUrl = (
    opts.baseUrl ?? process.env.CODEX_API_BASE_URL ?? DEFAULT_BASE
  ).replace(/\/+$/, '');

  let lastError = 'no attempt made';
  let lastHttpStatus;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const result = await singleAttempt(envelope, baseUrl);

    if (result.ok) {
      const status =
        result.body && typeof result.body === 'object' && result.body.status === 'already_present'
          ? 'already_present'
          : 'stored';
      return {
        status,
        httpStatus: result.httpStatus,
        controlsTouched: result.body?.controls_touched ?? envelope.controls_touched,
        attempts: attempt,
      };
    }

    lastHttpStatus = result.httpStatus;
    lastError =
      result.body?.error ??
      result.networkError ??
      `HTTP ${result.httpStatus ?? 'unknown'}`;

    // Hard failure on 4xx — schema or auth problem, retrying won't help.
    if (!result.retryable) {
      return {
        status: 'failed',
        httpStatus: result.httpStatus,
        error: lastError,
        attempts: attempt,
      };
    }

    // Exponential backoff: 500ms, 1500ms, 4500ms.
    if (attempt < RETRY_ATTEMPTS) {
      const delayMs = 500 * Math.pow(3, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    status: 'failed',
    httpStatus: lastHttpStatus,
    error: `gave up after ${RETRY_ATTEMPTS} attempts: ${lastError}`,
    attempts: RETRY_ATTEMPTS,
  };
}
