# Codex ↔ QMS CMMC Contract — Phase 0/1 Operator Runbook

This runbook walks through the org-scoping migration that lands before the per-control / bulk endpoints get built. It is the "what Patrick runs against prod" companion to the schema and code changes shipped on this branch.

After this runbook completes you will have:

1. The existing `Primary Organization` row renamed to `MacTech Solutions LLC` (slug=`mactech`).
2. The resulting UUID set as `MACTECH_DEFAULT_ORG_ID` in Railway env (both QMS and codex services).
3. `documents.organization_id` and `cmmc_documents.organization_id` columns added, backfilled, tightened to NOT NULL, FK'd, indexed.
4. `cmmc_documents.effective_date` (DATE, nullable) added and backfilled from each doc's latest `cmmc_revisions.date` when the string parses as `YYYY-MM-DD`. Avoids runtime-parsing the date string in the codex contract endpoints — null stays null honestly so the synthesis falls through to "no cadence on file" instead of silently passing adjudication.
5. Empty `document_cmmc_control_tags` and `cmmc_document_control_tags` junction tables ready for Phase 6 tagging UI to populate.
6. QMS deployed with the updated schema + code, refusing to start without the env var (fail-loud). CmmcDocument sync write-paths populate `effectiveDate` on doc create AND on every revision update, keeping the column fresh without re-runs of the backfill SQL.

## Pre-flight

- [ ] On a branch / PR that has been reviewed.
- [ ] You have psql access (or Railway → Postgres → Query) against prod.
- [ ] You can edit Railway env vars on the QMS service.
- [ ] You have a recent DB backup or Railway snapshot. The migration is idempotent and transactional, but rollback-by-restore is the safety net.

## Files shipped on this branch

| File | Purpose |
|---|---|
| `server/prisma/schema.prisma` | Final schema state: `organizationId` on Document + CmmcDocument, `effectiveDate` on CmmcDocument, two new junction models. |
| `server/prisma/sql/20260505_phase1a_rename_org_to_mactech.sql` | Step 1 SQL: rename the canonical org row, return its id. |
| `server/prisma/sql/20260505_phase1b_add_org_id_and_junctions.sql` | Step 2 SQL: org-scope columns + `cmmc_documents.effective_date` + junction tables, single transaction, idempotent. |
| `server/src/lib/orgScope.js` | New helper: `getMacTechOrgId()` — single source for the env-backed org id, throws on missing. |
| `server/src/lib/cmmc/docParser.js` | New export: `parseEffectiveDate(dateString)` — regex-guarded `YYYY-MM-DD` → `Date` parse, mirrors the SQL backfill regex, returns null on any failure. |
| `server/src/index.js` | Calls `getMacTechOrgId()` at boot to fail loud if env var missing. |
| `server/src/seed.js` | Upsert keyed on `slug='mactech'` with the new name. |
| `server/.env.example` | Documents `MACTECH_DEFAULT_ORG_ID`. |
| `server/src/documents.js` | `prisma.document.create` call sites (×2) populate `organizationId`. |
| `server/src/cmmc.js` | `prisma.cmmcDocument.create` populates `organizationId` + `effectiveDate`; revision-update path also bumps parent doc's `effectiveDate`. |
| `server/scripts/ingestCmmc.js` | Same. |
| `server/scripts/ingestGovernanceZip.js` | Populates `organizationId`. |
| `server/scripts/addGovernanceDocument.js` | Populates `organizationId`. |

## Order of operations

The two-step ritual (nullable → backfill → NOT NULL) is honored even though we're single-tenant today. Discipline costs nothing now and pays off when multi-tenant lands.

### Step 1 — Run the rename SQL against prod

```sh
psql $DATABASE_URL -f server/prisma/sql/20260505_phase1a_rename_org_to_mactech.sql
```

Expected output: a single row with three columns — `id`, `name`, `slug`. The `slug` is `mactech`, the `name` is `MacTech Solutions LLC`. Copy the **`id` UUID** somewhere you can paste it back.

If the SQL raises an exception about row counts, do not proceed — investigate the organization table state first.

### Step 2 — Set the env var in Railway

In the Railway dashboard, on the QMS service, add:

```
MACTECH_DEFAULT_ORG_ID = <uuid from Step 1>
```

Don't deploy yet — the new code on this branch isn't live, so there's nothing to break, but the env var has to land before the deploy that includes the startup-throw.

### Step 3 — Run the migration SQL against prod

```sh
psql $DATABASE_URL -f server/prisma/sql/20260505_phase1b_add_org_id_and_junctions.sql
```

The single transaction:

1. Verifies the `mactech`-slugged org row exists (errors out if Step 1 didn't run).
2. Adds `organization_id` columns to `documents` and `cmmc_documents` as nullable text.
3. Backfills both with the canonical org id.
4. Asserts no rows are still NULL (errors out if backfill missed anything).
5. Tightens to `NOT NULL`.
6. Adds FK constraints and indexes.
7. Adds `cmmc_documents.effective_date` (DATE, nullable) and backfills from each doc's latest `cmmc_revisions.date` when it matches `^\d{4}-\d{2}-\d{2}$`. Strings that don't match stay NULL.
8. Creates the two empty junction tables.

The trailing verification SELECT returns five columns:

| Column | Expected | If different |
|---|---|---|
| `null_doc_orgs` | `0` | Hard fail — the transaction rolled back. Read the error, fix, re-run. |
| `null_cmmc_orgs` | `0` | Hard fail — same. |
| `junction_tables` | `2` | Hard fail — both junction tables should exist. |
| `docs_without_effective_date` | informational | Investigate only if it equals `total_cmmc_docs` (i.e. zero parseable dates — likely format drift in the manifest, not a migration bug). A small non-zero count is normal: bundles with `"—"` placeholders or non-standard formats. |
| `total_cmmc_docs` | informational | Sanity-check it matches your expectation of how many bundle docs are in QMS today. |

If the hard-fail columns are nonzero, the transaction has already rolled back — read the error, fix, re-run.

### Step 4 — Deploy this branch

Merge the PR and deploy. The startup-throw in [server/src/index.js](server/src/index.js) will fire if the env var is missing — that's the safety net catching a misordered rollout.

### Step 5 — Smoke test

- [ ] QMS starts cleanly in Railway logs (no startup throw).
- [ ] `GET /api/documents` returns existing docs (org filter is not yet applied at the API layer — this is just confirming the FK didn't break anything).
- [ ] Hit the doc creation flow once via UI → confirm a new row in `documents` has `organization_id` populated.
- [ ] `prisma.documentCmmcControlTag` and `prisma.cmmcDocumentControlTag` are queryable from the Prisma client (`npx prisma studio` and look at the empty tables).

If everything is green, Phase 1 is done. The codex CMMC endpoints (Phase 4 of the implementation plan) are unblocked.

## Hand-offs

- [ ] **You → me**: paste the UUID from Step 1 into the next chat turn. I'll use it when I generate the IntegrationClient seed for Phase 2.
- [ ] **You → Railway**: set `MACTECH_DEFAULT_ORG_ID=<uuid>` in Railway env on **both** the QMS service AND the codex service. Codex doesn't filter by it today, but stashing the same constant in env means the codex client's outbound calls can pass an `org` claim trivially when QMS goes multi-tenant. Same env-var name on both sides keeps the future migration symmetric.
- [ ] **You → codex side**: nothing yet. The Phase 6 governance-controls JSON has already been published on the codex side at `docs/specs/governance-18-controls.json` (commit 2161009 on `claude/serene-keller-438354`); QMS will vendor it during Phase 6. Note: filename keeps the legacy "-18" suffix for code-stability reasons; actual content is 17 controls. The codex `PURE_GOV_CONTROL_IDS` constant in `src/lib/governance/seed-data.ts` is the authoritative count.
- [ ] **Me → you (next session)**: Phase 2 — `cmmc:read` scope + IntegrationClient row provisioning script. After you run that, you hand me back the `clientId='mactech-codex'` + raw secret out-of-band.

## Rollback

If Step 3 partially fails (it shouldn't — single transaction) or you need to back out before deploying:

```sql
-- Drop in reverse order. Safe because no app code references these yet.
DROP TABLE IF EXISTS cmmc_document_control_tags;
DROP TABLE IF EXISTS document_cmmc_control_tags;

ALTER TABLE cmmc_documents DROP COLUMN IF EXISTS effective_date;

ALTER TABLE cmmc_documents DROP CONSTRAINT IF EXISTS cmmc_documents_organization_id_fkey;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_organization_id_fkey;
DROP INDEX IF EXISTS cmmc_documents_organization_id_idx;
DROP INDEX IF EXISTS documents_organization_id_idx;
ALTER TABLE cmmc_documents DROP COLUMN IF EXISTS organization_id;
ALTER TABLE documents DROP COLUMN IF EXISTS organization_id;

-- Revert the rename if needed (rare):
UPDATE organizations SET name='Primary Organization', slug='primary' WHERE slug='mactech';
```

Code rollback is just `git revert` of the merge commit.

## Notes

- The migration SQL files use `IF NOT EXISTS` / `IF NOT EXISTS` constraint guards / NULL-checks throughout. Re-running them after a successful run is a no-op.
- The `organization_id` foreign keys use `ON DELETE RESTRICT` to match the existing `ExecutionPackage → Organization` relation. You cannot delete an Organization while documents reference it; that's deliberate.
- Junction tables use `ON DELETE CASCADE` because tags are derived data — if a Document is hard-deleted, its tags should follow.
- Multi-tenant migration path is documented inline as `TODO(multi-tenant)` comments in `server/src/lib/orgScope.js` and `server/src/index.js`. When a second tenant lands, the work is: add `IntegrationClient.organizationId`, embed `org` claim in the minted JWT, replace `getMacTechOrgId()` calls with per-request `req.integration.organizationId`. The query call sites do not change shape.
