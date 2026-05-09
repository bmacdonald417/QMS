# Codex SSP Doc Control Bridge — Phase 2 Operator Runbook

QMS-side receiver for the Trust Codex System Security Plan submission flow. After this runbook completes, Codex can `POST /api/external-submissions/ssp`, the submission lands as a staged record, QMS humans walk it through Reviewer → Approver → Quality Release, and on release the next governance manifest export carries the doc back so Codex Phase 3 can match it to the original submission.

## Pre-flight

- [ ] Phase 1 (codex contract) is shipped — schema has `Document.organizationId`, junctions exist, `MACTECH_DEFAULT_ORG_ID` is set.
- [ ] PR with this branch reviewed.
- [ ] You have psql access (or Railway → Postgres → Query) against prod.
- [ ] You can edit Railway env vars on **both** the QMS service and the Codex service.
- [ ] You have a recent DB backup or Railway snapshot.

## Files shipped on this branch

| File | Purpose |
|---|---|
| `server/prisma/schema.prisma` | `SSP` enum value + `ExternalDocumentSubmission` model + `ExternalSubmissionStatus` enum + back-relations on `Document`/`FileAsset`/`User`. |
| `server/prisma/sql/20260509_phase2_external_submissions_ssp.sql` | Idempotent migration: enum + table + indexes + idempotency unique constraint. |
| `server/src/lib/sspSubmissionContract.js` | Pure validation (7 gates) + `deriveSubmissionStatusFromDocument`. |
| `server/src/lib/sspSubmissionContract.test.js` | 12 unit tests. |
| `server/src/lib/inboundBridgeAuth.js` | Bearer + HMAC middleware factory; raw-body discipline; constant-time compare. |
| `server/src/lib/inboundBridgeAuth.test.js` | 10 unit tests. |
| `server/src/externalSubmissionsSsp.js` | `POST /ssp` (bridge), `GET /` (admin list), `GET /:id` (admin detail), `POST /:id/reject`. |
| `server/src/index.js` | Mounts the new router at `/api/external-submissions`. |
| `server/src/lib/buildQmsGovernanceManifest.js` | `qmsDocumentTypeToManifestType` adds `SSP → 'ssp'`. |
| `server/scripts/bulkPushToCodex.js` | `CMMC_GROUP` adds `SSP` so released SSPs are included in the manifest envelope. |
| `server/scripts/seedCodexBridgeUser.js` | Idempotent seed for the `codex-bridge@mactechsolutionsllc.com` bot user. |
| `server/scripts/generateSspBridgeSecrets.js` | Stdout-only secret generator. |
| `server/scripts/smokeTestSspBridge.sh` | curl-based end-to-end smoke test. |
| `src/components/cmmc/DocStatusBadge.tsx` | Shared status pill component (replaces inline helper in `SystemGovernanceRelease.tsx`). |
| `src/pages/system/SystemExternalSubmissions.tsx` | Admin list + reject modal. |
| `src/pages/system/SystemManagementLayout.tsx` | Sidebar entry. |
| `src/App.tsx` | Route registration. |

## Order of operations

### Step 1 — Run the migration SQL

```sh
psql $DATABASE_URL -f server/prisma/sql/20260509_phase2_external_submissions_ssp.sql
```

Expected verification row at the end:

```
 ssp_enum_value | table_exists | submission_count
----------------+--------------+------------------
              1 |            1 |                0
```

The `ALTER TYPE … ADD VALUE` needs to run before any code that references the new enum value. If your prod Postgres is on a version that requires the ALTER TYPE outside a transaction, the SQL file's `IF NOT EXISTS` guard makes the BEGIN/COMMIT a no-op for that step — but if it errors, run `ALTER TYPE "DocumentType" ADD VALUE 'SSP'` manually first then re-run the rest.

### Step 2 — Seed the bot user

```sh
railway run node server/scripts/seedCodexBridgeUser.js
```

Output prints the bot user's UUID. Optional: set `CODEX_BRIDGE_USER_ID=<uuid>` in QMS Railway env to skip the email lookup at request time.

### Step 3 — Generate and distribute the shared secrets

```sh
node server/scripts/generateSspBridgeSecrets.js
```

Output goes to stdout only. Copy both values into 1Password (or Signal to me on the Codex side):

- Set in **QMS Railway** env on this service:
  - `SSP_BRIDGE_TOKEN=<value 1>`
  - `SSP_BRIDGE_HMAC=<value 2>`
- Set in **Codex Railway** env on `codex.mactechsolutionsllc.com`:
  - `SSP_DOC_CONTROL_BRIDGE_TOKEN=<value 1>`
  - `SSP_DOC_CONTROL_BRIDGE_HMAC=<value 2>`

Same two values, different env-var names on each side. Clear your terminal scrollback after capturing.

### Step 4 — Deploy this branch to QMS Railway

Merge & deploy. Startup-throw still fires if `MACTECH_DEFAULT_ORG_ID` is unset (Phase 1 guard). The bridge route also fails closed (500 internal_error) if either `SSP_BRIDGE_TOKEN` or `SSP_BRIDGE_HMAC` is unset — this is intentional and visible in the logs.

### Step 5 — Run the smoke test

```sh
QMS_BASE_URL=https://quality.mactechsolutionsllc.com \
SSP_BRIDGE_TOKEN=<value 1> \
SSP_BRIDGE_HMAC=<value 2> \
bash server/scripts/smokeTestSspBridge.sh
```

Expected: `HTTP 202` on first run, `HTTP 200` (idempotent replay) on second run with the same submission_id. Both responses include `qms_submission_id` + `qms_document_number`.

After the first run, check:
- [ ] `${QMS_BASE_URL}/system/external-submissions` shows the new row with status `PENDING_REVIEW`.
- [ ] The linked `Document` (click through from the table) is in DRAFT, authored by `Trust Codex (automated)`, with the PDF visible as an attachment.
- [ ] All 110 controls show as junction tags on the Document.

### Step 6 — Hand off to Codex side

Tell me (Codex side) the bridge is live with the secrets configured. I'll:
- Set the two env vars in Codex Railway
- Flip the "Submit to Doc Control" button to call the live bridge
- Once a real submission lands and you walk it through QMS to EFFECTIVE, the next manifest export will surface it; my Phase 3 linker matches by `document_number` + `sha256` and updates the submission row's status from `submitted` → `released`.

## End-to-end verification (after a real release)

When QMS Quality Release approves a real submitted SSP:

1. The Document goes EFFECTIVE.
2. The next `bulkPushToCodex.js` run includes it (now that `SSP` is in `CMMC_GROUP`).
3. Codex's `/api/integrations/qms-manifest/ingest` receives a manifest with one entry like:

   ```json
   {
     "document_number":  "SSP-001",
     "document_type":    "ssp",
     "version":          "3.0",
     "status":           "effective",
     "released":         true,
     "released_at":      "2026-MM-DDT…Z",
     "sha256":           "<sha256 of the released artifact>",
     "controls_mapped":  ["3.1.1", "3.1.2", … 110 entries …],
     "signatures": [
       { "signer_name": "...", "signature_meaning": "Reviewer",        "signed_at": "…", "signature_hash": "…" },
       { "signer_name": "...", "signature_meaning": "Approver",        "signed_at": "…", "signature_hash": "…" },
       { "signer_name": "...", "signature_meaning": "Quality Release", "signed_at": "…", "signature_hash": "…" }
     ]
   }
   ```

4. Codex Phase 3 sees the entry, matches `document_number === 'SSP-001'`, and links it to the `submitted` submission row.
5. Codex `/dashboard/ssp` flips the panel from "Submitted to Doc Control" to "Released by Doc Control as SSP-001 on YYYY-MM-DD."

## Tests run on this branch

Run locally before deploy:

```sh
node server/src/lib/sspSubmissionContract.test.js   # 12/12 passing
node server/src/lib/inboundBridgeAuth.test.js       # 10/10 passing
```

Plus the existing unit suites:
```sh
node server/src/cmmcControls.test.js
node server/src/capas.test.js
```

## Rollback

If the bridge needs to be backed out:

1. Revert the merge commit: `git revert -m 1 <merge-sha>` (or the squash commit if direct-to-main).
2. Drop the new table: `DROP TABLE external_document_submissions;`
3. Optionally drop the SSP enum value (PostgreSQL doesn't support `ALTER TYPE … DROP VALUE` directly — leave it; harmless if no rows reference it).
4. Unset both bridge env vars in QMS Railway.
5. Codex side: unset its two env vars; the "Submit to Doc Control" button fails closed.

The schema additions are additive — rolling back the SQL is non-destructive to existing QMS data.

## Notes / known forward-compat hooks

- **Multi-tenant**: same TODO(multi-tenant) treatment as Phase 1. Bot user is org-scoped via `OrganizationMembership`. Bridge currently uses `MACTECH_DEFAULT_ORG_ID` for the seeded Document's `organizationId`; the staging row carries `externalOrganizationId` separately so cross-system org mapping can land later.
- **Bridge versioning**: `bridge_version` field is accepted (default `"1"`) and persisted as `inboundBridgeVersion` on the staging row. Validation gate rejects unknown values. v2 evolution: extend `SUPPORTED_BRIDGE_VERSIONS` in `sspSubmissionContract.js` and branch on the field inside the route handler.
- **Reject path**: `POST /api/external-submissions/:id/reject` requires System Admin. Rejection archives the linked Document. Codex notices on the next manifest pull (no released doc); no push callback in v1.
- **Next-version flow**: when SSP v4 arrives for the same `document_number`, the route handler bumps `versionMajor` from the prior Document and links the prior staging row via `supersededBySubmissionId`. Manifest carries both versions; Codex Phase 3 picks the one whose `sha256` matches the new submission's `payload_sha256`.
