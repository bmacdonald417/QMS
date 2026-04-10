# Integration Token Auth

This document describes how to create integration clients, obtain short-lived tokens, and call QMS APIs with scoped integration auth.

## Overview

Integration auth replaces the legacy `X-INTEGRATION-KEY` header with:

- **Scoped JWT tokens** – Short-lived (5–15 min), auditable, per-client
- **Client credentials** – `clientId` + `clientSecret` (one-time on create/rotate)
- **Scope enforcement** – Each endpoint requires specific scopes

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INTEGRATION_JWT_SECRET` | Yes (for integration auth) | Separate secret for signing integration tokens. If missing, integration token auth is disabled. |
| `INTEGRATION_TOKEN_TTL_MINUTES` | No | Token lifetime in minutes (default: 10) |
| `ALLOW_LEGACY_INTEGRATION_KEY` | No | Set to `true` to allow legacy `X-INTEGRATION-KEY` during migration (default: false) |

## Creating a Client

Only System Admins can create integration clients.

### Via API

```bash
# Create client (requires JWT of System Admin)
curl -X POST https://your-qms/api/system/integrations/clients \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name": "Governance Service", "scopes": ["formrecords:read", "formrecords:write", "governance:read", "governance:write"]}'
```

Response (secret shown **once only**):

```json
{
  "clientId": "ic_xxxxxxxxxxxx",
  "clientSecret": "sec_xxxxxxxxxxxx",
  "name": "Governance Service",
  "scopes": ["formrecords:read", "formrecords:write", "governance:read", "governance:write"],
  "message": "Store clientSecret securely. It will not be shown again."
}
```

### Via UI

1. Go to **System → Integrations**
2. Click **Create Client**
3. Enter name and select scopes
4. Copy `clientId` and `clientSecret` immediately (secret is shown once)

## Obtaining a Token

```bash
curl -X POST https://your-qms/api/integrations/token \
  -H "Content-Type: application/json" \
  -d '{"clientId": "ic_xxxxxxxxxxxx", "clientSecret": "sec_xxxxxxxxxxxx"}'
```

Response:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 600,
  "scope": "formrecords:read formrecords:write governance:read governance:write"
}
```

## Calling Endpoints

Use the token in the `Authorization` header or `X-INTEGRATION-TOKEN`:

```bash
# Authorization: Bearer
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://your-qms/api/form-records

# Or X-INTEGRATION-TOKEN
curl -H "X-INTEGRATION-TOKEN: YOUR_ACCESS_TOKEN" \
  https://your-qms/api/form-records
```

## Scope Catalog

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `formrecords:read` | Read form records | GET /api/form-records, GET /api/form-records/:id |
| `formrecords:write` | Create/update/finalize form records | POST, PUT, POST :id/finalize, DELETE |
| `training:read` | Read training modules, assignments, completions | GET /api/training/modules, /assignments, /completions |
| `governance:read` | Read signable items, artifacts, verify | GET /api/governance/* |
| `governance:write` | Create signature requests, submit artifacts | POST /api/governance/signature-requests, /signature-artifacts |

## Rotating Secrets

If a secret is compromised, rotate it. The old secret is invalidated immediately.

```bash
curl -X POST https://your-qms/api/system/integrations/clients/ic_xxx/rotate-secret \
  -H "Authorization: Bearer YOUR_JWT"
```

Response includes the new `clientSecret` (shown once).

## Audit Logging

All integration-authenticated requests are audited with:

- `actorType`: `INTEGRATION`
- `actorId`: client ID
- `scopesUsed`: scopes from the token

## Migration from X-INTEGRATION-KEY

1. Set `INTEGRATION_JWT_SECRET` and run `npx prisma db push` to create integration tables
2. Create a client with the scopes you need
3. Update your integration to:
   - Call `POST /api/integrations/token` with `clientId` and `clientSecret`
   - Use `Authorization: Bearer <access_token>` in API requests
   - Refresh the token before it expires (e.g. every 5–8 min)

4. Optionally set `ALLOW_LEGACY_INTEGRATION_KEY=true` during transition
5. After migration, set `ALLOW_LEGACY_INTEGRATION_KEY=false` (or omit) to disable legacy key
