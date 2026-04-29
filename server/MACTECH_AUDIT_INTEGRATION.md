# MacTech Identity audit integration

QMS now forwards audit events to the central
[MacTech Identity Command Center](https://www.suite.mactechsolutionsllc.com)
via its `/api/audit/ingest` endpoint.

## Required env vars (server-side)

| Variable | Purpose |
| --- | --- |
| `MACTECH_IDENTITY_BASE_URL` | Defaults to `https://www.suite.mactechsolutionsllc.com`. Override only for staging. |
| `MACTECH_AUDIT_INGEST_API_KEY` | Bearer key shared with the central hub. Server-side only. |

The Railway service (`MACTECH_QMS` or whichever environment runs this
backend) needs both variables set.

## What is sent automatically

`server/src/auth.js > authMiddleware` fires one `quality.session.opened`
event per Clerk user per process, throttled to once per hour. Per-process
state is not shared across replicas, so worst case you see N events per
hour per user where N = replica count. Acceptable noise for a session
signal.

Failures never throw upstream — `sendAuditLogAsync` swallows network or
hub errors so a downstream outage in Identity cannot break QMS auth.

## How to log a custom event

```js
import { sendAuditLog } from './mactechAuditClient.js';

await sendAuditLog({
  payload: {
    appKey: 'quality',
    eventType: 'quality.document.published',
    eventCategory: 'evidence',
    severity: 'info',
    action: `Published document ${doc.title} (rev ${doc.revision})`,
    actorClerkUserId: req.clerkPayload?.sub,
    actorEmail: req.user.email,
    resourceType: 'document',
    resourceId: String(doc.id),
    metadata: { revision: doc.revision, controlIds: doc.controlIds },
  },
});
```

The full surface lives in `server/src/mactechAuditClient.js`. The
server-side payload schema is enforced by the central hub
(`mactech-suite-platform/lib/validations/audit.ts`).
