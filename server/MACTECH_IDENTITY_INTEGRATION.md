# MacTech Identity Command Center — JIT user provisioning

QMS now treats the central
[MacTech Identity Command Center](https://www.suite.mactechsolutionsllc.com)
as the source of truth for *who can sign into QMS*.

## What changed

`server/src/auth.js > resolveLocalUserFromClerk` previously refused any
Clerk user it didn't already have a row for, returning the famous
"No QMS account linked" error. It now has a third lookup step:

  1. **Lookup by `clerkUserId`** — fast path for existing users.
  2. **Adopt by email** — for legacy users created before the Clerk cutover.
  3. **JIT-provision from the Identity Command Center (NEW)** — call
     `/api/v1/users/{clerkUserId}/access?appKey=quality` on the central
     hub. If the user has access to QMS via any of their org
     entitlements (or is an internal MacTech operator), create a local
     QMS user row with the central role mapped to a QMS role and
     continue. Otherwise, refuse as before.

## Required env vars

Already set on this service (added during the audit-forwarder rollout):

  MACTECH_IDENTITY_BASE_URL    https://www.suite.mactechsolutionsllc.com
  MACTECH_AUDIT_INGEST_API_KEY mts_…  (shared secret with the central hub)

The same key is reused for both the audit-forwarder and the identity
check. Once you mint per-app keys in the central admin UI, this service
should be issued one with `user_access_read` + `audit_ingest` scopes.

## Role mapping

ICC customer-org role → QMS Role.name:

| ICC role | QMS role |
| --- | --- |
| `customer_owner` | System Admin |
| `customer_admin` | System Admin |
| `compliance_manager` | Quality Manager |
| `security_manager` | Manager |
| `evidence_contributor` | User |
| `auditor` | Read-Only |
| `read_only_user` | Read-Only |
| (internal MacTech user) | System Admin |

Edit `mapIccRoleToQmsRole()` in `server/src/auth.js` to tweak. Roles can
be promoted/demoted later inside QMS without affecting the central
mapping — JIT only fires on first sign-in.

## Failure mode

If the ICC is unreachable, `checkIdentityAccess` returns
`{ ok: false, reason: 'transient' }` and `findActiveAccessForApp`
returns null. QMS then refuses with the existing "No QMS account
linked" error. We **fail closed** by design — wrong access decisions
are worse than a temporary outage. The operator just retries when ICC
is back.

## Net effect

To grant a customer user access to QMS:

  Old: log into QMS as System Admin, find the user, invite them, wait.
  New: in the central admin UI, set `quality` to enabled in the
       customer org's product entitlements + add the user to the org.
       Their next QMS sign-in JIT-provisions a QMS user row.

Customer org admins managing QMS access via the central UI also see
audit-log entries for `customer_user.added` etc. firing the existing
`customer_user.added` webhooks — so QMS gets notified in real time
even before the user logs in.
