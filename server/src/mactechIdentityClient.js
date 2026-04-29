/**
 * MacTech Identity client (drop-in, ESM, dependency-free).
 *
 * Asks the central Identity Command Center hub at
 * `${MACTECH_IDENTITY_BASE_URL}/api/v1/users/{clerkUserId}/access` whether
 * a Clerk user has access to THIS app via any of their customer-org
 * memberships. Returns a structured access record on yes, an explicit
 * reason on no.
 *
 * Auth: same `MACTECH_AUDIT_INGEST_API_KEY` used by the audit client.
 *
 * Pattern: the QMS auth middleware calls `checkIdentityAccess` after
 * verifying the Clerk JWT but before refusing as "no QMS account linked".
 * On a hit, JIT-create the local QMS user row mapped from the central
 * role. On a miss, refuse with a helpful message that points the user
 * back to the central admin to be invited.
 */

const DEFAULT_BASE_URL = "https://www.suite.mactechsolutionsllc.com";

function resolveBaseUrl(explicit) {
  return explicit || process.env.MACTECH_IDENTITY_BASE_URL || DEFAULT_BASE_URL;
}

function resolveApiKey(explicit) {
  return explicit || process.env.MACTECH_AUDIT_INGEST_API_KEY;
}

export async function checkIdentityAccess(opts) {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const apiKey = resolveApiKey(opts.apiKey);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  if (!apiKey) {
    console.warn("[mactech-identity] MACTECH_AUDIT_INGEST_API_KEY not configured; cannot reach ICC.");
    return { ok: false, reason: "transient" };
  }

  const url = new URL(
    `/api/v1/users/${encodeURIComponent(opts.clerkUserId)}/access`,
    baseUrl,
  );
  if (opts.appKey) url.searchParams.set("appKey", opts.appKey);
  if (opts.clerkOrgId) url.searchParams.set("clerkOrgId", opts.clerkOrgId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 5000);

  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { "X-MacTech-Audit-Key": apiKey },
      signal: controller.signal,
    });
    if (res.status === 404) return { ok: false, reason: "user_not_found", status: 404 };
    if (res.status === 401) return { ok: false, reason: "unauthorized", status: 401 };
    if (!res.ok) {
      console.error(`[mactech-identity] ICC returned ${res.status}`);
      return { ok: false, reason: "transient", status: res.status };
    }
    const body = await res.json();
    return { ok: true, user: body.user, orgs: body.orgs || [] };
  } catch (err) {
    console.error("[mactech-identity] checkIdentityAccess failed:", err);
    return { ok: false, reason: "transient" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pick the first active access path for `appKey`. Internal MacTech users
 * get a synthetic match (they have access to every app by design). Returns
 * { user, org, entitlement } or null if no active access exists.
 */
export function findActiveAccessForApp(result, appKey) {
  if (!result.ok || !result.user) return null;
  if (result.user.status !== "active") return null;

  if (result.user.isInternalMacTechUser) {
    return {
      user: result.user,
      org: {
        orgId: "mactech-internal",
        clerkOrgId: null,
        orgName: "MacTech Solutions",
        orgStatus: "active",
        memberStatus: "active",
        role: result.user.platformRole,
        permissions: [],
        enabledApps: [],
      },
      entitlement: {
        appKey,
        appName: appKey,
        plan: "internal",
        status: "active",
        expiresAt: null,
      },
    };
  }

  for (const org of result.orgs) {
    if (org.memberStatus !== "active") continue;
    // Onboarding orgs are legitimate — they've been created in the central
    // hub but the wizard isn't fully complete. Customer users should still
    // be able to sign in. Suspended/archived orgs are intentionally blocked.
    if (org.orgStatus !== "active" && org.orgStatus !== "onboarding") continue;
    const entitlement = (org.enabledApps || []).find((e) => e.appKey === appKey);
    if (!entitlement) continue;
    if (entitlement.status !== "active" && entitlement.status !== "trialing") continue;
    return { user: result.user, org, entitlement };
  }
  return null;
}
