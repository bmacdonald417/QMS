# Governance Approval Verification

This document describes the Governance approval verification layer: env vars, API, and test plan. **Existing QMS SHA-256 hashing/signing is unchanged.**

---

## 1. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOV_ED25519_PUBLIC_KEY` | For verification | Ed25519 public key (PEM format) used to verify Governance signatures. If unset, verification always returns `INVALID` (reason: "Missing GOV_ED25519_PUBLIC_KEY or artifact signature"). |
| `INTEGRATION_KEY` | Optional | Same as form records: when set, `X-INTEGRATION-KEY` header allows Governance API access without JWT. |
| `INTEGRATION_AUDIT_USER_ID` | Optional | User ID for audit logs when using integration key. |

**PEM format:** The key can be a single line (with `\n` escaped) or multi-line. The code normalizes with `.replace(/\\n/g, '\n')`.

**Example (multi-line in .env):**
```env
GOV_ED25519_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9EC...
-----END PUBLIC KEY-----"
```

Or single-line (escape newlines as `\n` if your env loader supports it).

---

## 2. Signable Records: qmsHash and recordVersion

Each signable record type exposes **qmsHash** and **recordVersion** (no change to existing internal signing).

| Entity | Where exposed | recordVersion | qmsHash |
|--------|----------------|---------------|---------|
| **Document** | GET `/api/documents/:id` | `versionMajor.versionMinor` | SHA-256 of canonical payload (id, documentId, versionMajor, versionMinor, content) |
| **FormRecord** | GET `/api/form-records/:id` | Stored `recordVersion` (int, increments on update/finalize) | Stored `qmsHash` (computed on create/update/finalize) |
| **CAPA** | GET `/api/capas/:id` | `updatedAt.getTime()` | SHA-256 of canonical payload (id, capaId, status, title, description, updatedAt) |
| **ChangeControl** | GET `/api/change-controls/:id` | `updatedAt.getTime()` | SHA-256 of canonical payload (id, changeId, title, status, updatedAt) |

**Canonical payload** (same as Governance must use to sign): deterministic JSON, keys sorted. See GET `/api/governance/canonical-payload/:entityType/:entityId` to retrieve the exact string.

---

## 3. Governance API (Auth: JWT or X-INTEGRATION-KEY)

Base path: `/api/governance`. Access: System Admin, Quality Manager, or Admin (or integration key).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/signable-items?entityType=&limit=` | List signable records with `entityType`, `entityId`, `title`, `recordVersion`, `qmsHash`. |
| GET | `/signature-requests?entityType=&entityId=&status=` | List signature requests. |
| POST | `/signature-requests` | Create request. Body: `entityType`, `entityId`, optional `recordVersion`, `qmsHash`, `governanceRequestId`, `notes`. |
| GET | `/signature-artifacts?entityType=&entityId=` | List artifacts. |
| POST | `/signature-artifacts` | Submit artifact. Body: `entityType`, `entityId`, `recordVersion`, `qmsHash`, `signature` (base64 Ed25519), optional `signedAt`, `signatureRequestId`. Response includes `verification: { status, verifiedAt }`. |
| GET | `/verify/:entityType/:entityId` | Get latest artifact and re-run verification; returns `hasArtifact`, `artifact`, `verification`. |
| GET | `/canonical-payload/:entityType/:entityId` | Get exact canonical payload string, `qmsHash`, `recordVersion` for Governance to sign. |

---

## 4. Verification Logic

1. Load **SignatureArtifact** for the record/version (latest by `signedAt`).
2. Load current record from DB.
3. Recompute **canonical payload** (same as Governance).
4. **Verify** Ed25519: `crypto.verify(null, Buffer.from(canonicalPayload, 'utf8'), publicKey, signatureBuffer)`.
5. Compare **artifact.qmsHash** to current record qmsHash (recomputed).
6. **Status:**
   - **VERIFIED** — Signature valid and artifact.qmsHash === current qmsHash.
   - **STALE** — artifact.qmsHash !== current qmsHash (record changed after signature).
   - **INVALID** — Signature verification failed or missing key/signature.

---

## 5. Record Detail: Governance Approval Panel

On each record detail page, a **Governance Approval** panel shows:

- **No artifact** — “No governance signature artifact on file.”
- **With artifact** — Status badge (VERIFIED / INVALID / STALE), signed at, verified at, record version at sign, qmsHash at sign, and reason if not VERIFIED.

**Endpoints used by the panel:**

- Document: GET `/api/documents/:id/governance-approval`
- Form record: GET `/api/form-records/:id/governance-approval`
- CAPA: GET `/api/capas/:id/governance-approval`
- Change control: GET `/api/change-controls/:id/governance-approval`

Same permissions as viewing the record (document:view, form_records:view, capa:view, change:view).

---

## 6. Exact File Changes

| Area | Files |
|------|--------|
| **Schema** | `server/prisma/schema.prisma` — FormRecord: `qmsHash`, `recordVersion`; new enums `SignatureRequestStatus`, `GovernanceVerificationStatus`; new models `SignatureRequest`, `SignatureArtifact`; User relation `signatureRequestsCreated`. |
| **Governance core** | `server/src/governance.js` — Canonical payload, `computeQmsHash`, `getRecordVersion`, `verifyGovernanceSignature`, `getGovernanceApprovalStatus`. |
| **Governance API** | `server/src/governanceRoutes.js` — Routes: signable-items, signature-requests, signature-artifacts, verify, canonical-payload. |
| **App mount** | `server/src/index.js` — `app.use('/api/governance', governanceRoutes)`. |
| **Documents** | `server/src/documents.js` — Import governance helpers; GET `/:id` adds `qmsHash`, `recordVersion`; GET `/:id/governance-approval`. |
| **Form records** | `server/src/formRecords.js` — Import governance; create/update/finalize set `qmsHash`/`recordVersion`; GET `/:id` ensures qmsHash/recordVersion; GET `/:id/governance-approval`. |
| **CAPA** | `server/src/capas.js` — Import governance; GET `/:id` adds `qmsHash`, `recordVersion`; GET `/:id/governance-approval`. |
| **Change control** | `server/src/changeControls.js` — Import governance; GET `/:id` adds `qmsHash`, `recordVersion`; GET `/:id/governance-approval`. |
| **Frontend** | `src/components/modules/compliance/GovernanceApprovalPanel.tsx` — New component. |
| **Pages** | `src/pages/DocumentDetail.tsx`, `CompletedFormDetail.tsx`, `capas/CAPADetail.tsx`, `ChangeControlDetail.tsx` — Import and render `GovernanceApprovalPanel` with entity-specific approval URL. |

---

## 7. Test Plan

### 7.1 Schema and server

1. **Apply schema**  
   `cd server && npx prisma generate && npx prisma db push`

2. **Env**  
   Set `GOV_ED25519_PUBLIC_KEY` to a valid Ed25519 public key (PEM). Optional: `INTEGRATION_KEY` for API tests.

3. **Start server**  
   `npm run dev` (or start server only). Ensure no import errors (governance, governanceRoutes).

### 7.2 Expose qmsHash and recordVersion

4. **Document**  
   GET `/api/documents/:id` (with auth). Response `document` must include `qmsHash` (string) and `recordVersion` (e.g. `"1.0"`).

5. **FormRecord**  
   Create a form record, then GET `/api/form-records/:id`. Response `record` must include `qmsHash` and `recordVersion`. Update the record; GET again and confirm `recordVersion` incremented and `qmsHash` changed.

6. **CAPA**  
   GET `/api/capas/:id`. Response `capa` must include `qmsHash` and `recordVersion`.

7. **Change control**  
   GET `/api/change-controls/:id`. Response `changeControl` must include `qmsHash` and `recordVersion`.

### 7.3 Governance API

8. **Signable items**  
   GET `/api/governance/signable-items` (JWT or X-INTEGRATION-KEY). Expect 200 and `items` array with at least one of Document/FormRecord/CAPA/ChangeControl; each item has `entityType`, `entityId`, `recordVersion`, `qmsHash`, `title` (or similar).

9. **Canonical payload**  
   Pick an existing document id. GET `/api/governance/canonical-payload/Document/:id`. Expect 200 and `canonicalPayload`, `qmsHash`, `recordVersion`. Confirm `qmsHash` matches GET `/api/documents/:id` → `document.qmsHash`.

10. **Signature request**  
    POST `/api/governance/signature-requests` with body `{ "entityType": "Document", "entityId": "<doc-id>" }`. Expect 201 and `request` with `status: "PENDING"`. GET `/api/governance/signature-requests?entityId=<doc-id>` and confirm the request appears.

11. **Submit artifact (no real key)**  
    POST `/api/governance/signature-artifacts` with body `entityType`, `entityId`, `recordVersion`, `qmsHash` from canonical-payload, `signature`: any base64 string (e.g. `"dGVzdA=="`). Expect 201; `verification.status` should be `INVALID` (signature won’t verify unless key/signature match).

12. **Verify endpoint**  
    GET `/api/governance/verify/Document/:id`. With an artifact stored, expect 200 and `hasArtifact: true`, `artifact`, `verification` with `status` one of VERIFIED/INVALID/STALE.

### 7.4 Verification status (with real key)

13. **Generate Ed25519 key pair** (e.g. Node):  
    `require('crypto').generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })`.  
    Set `GOV_ED25519_PUBLIC_KEY` to the public PEM.

14. **Sign canonical payload** (same string as GET canonical-payload) with the private key; base64-encode the signature.

15. **POST signature-artifacts** with that `signature`, correct `qmsHash` and `recordVersion`. Expect `verification.status` **VERIFIED**.

16. **Change the record** (e.g. edit document content), then GET verify again. Expect **STALE** (qmsHash changed).

### 7.5 UI

17. **Document detail**  
    Open a document detail page. Scroll to “Governance Approval” panel. With no artifact: message “No governance signature artifact on file.” With artifact: status badge and metadata.

18. **Form record / CAPA / Change control detail**  
    Same: “Governance Approval” panel present and shows no-artifact or artifact status.

### 7.6 Permissions

19. **Governance API**  
    Call GET `/api/governance/signable-items` with a user that is not System Admin / Quality Manager / Admin and without X-INTEGRATION-KEY. Expect 403.

20. **Record governance-approval**  
    Call GET `/api/documents/:id/governance-approval` with a user that has `document:view`. Expect 200. Without document:view, expect 403.

---

## 8. Summary

- **qmsHash** and **recordVersion** are exposed on all signable records (Document, FormRecord, CAPA, ChangeControl); FormRecord persists them, others computed on read.
- **Governance** can list signable items, create signature requests, and submit **SignatureArtifact** (Ed25519 signature). **Verification** uses `GOV_ED25519_PUBLIC_KEY`, recomputes canonical payload, and returns **VERIFIED** / **INVALID** / **STALE**.
- **Governance Approval** panel on each record detail page shows latest artifact and verification status.
- **Existing QMS signing** (document/CAPA/change control hashes and signature hashes) is **not** modified.
