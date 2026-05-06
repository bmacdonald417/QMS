-- Phase 1b — Org-scope documents + cmmc_documents, then add CMMC control-tag junctions.
-- Run AFTER phase1a (rename) AND AFTER MACTECH_DEFAULT_ORG_ID is set in Railway env.
-- Idempotent: every step uses IF NOT EXISTS / WHERE NOT EXISTS / ON CONFLICT guards.
-- Single transaction — all-or-nothing.
--
-- Run via:  psql $DATABASE_URL -f 20260505_phase1b_add_org_id_and_junctions.sql
-- Or paste into Railway Postgres → Query.
--
-- Implements the two-step ritual (nullable → backfill → NOT NULL) inside one transaction,
-- which is fine for a single-tenant deploy with a known canonical org. Multi-tenant would
-- require splitting these into separate deploys with app-side dual-write logic between them.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: resolve the canonical MacTech org id. Hard-fail if phase1a wasn't run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mactech_id text;
BEGIN
  SELECT id INTO mactech_id FROM organizations WHERE slug = 'mactech' LIMIT 1;
  IF mactech_id IS NULL THEN
    RAISE EXCEPTION 'No organization with slug=mactech found. Run phase1a first.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: documents.organization_id — add nullable, backfill, tighten, FK, index.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS organization_id text;

UPDATE documents
   SET organization_id = (SELECT id FROM organizations WHERE slug = 'mactech' LIMIT 1)
 WHERE organization_id IS NULL;

DO $$
DECLARE
  unscoped_count int;
BEGIN
  SELECT count(*) INTO unscoped_count FROM documents WHERE organization_id IS NULL;
  IF unscoped_count > 0 THEN
    RAISE EXCEPTION 'documents backfill incomplete: % rows still NULL', unscoped_count;
  END IF;
END $$;

ALTER TABLE documents
  ALTER COLUMN organization_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_organization_id_fkey'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documents_organization_id_idx ON documents(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: cmmc_documents.organization_id — same ritual.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cmmc_documents
  ADD COLUMN IF NOT EXISTS organization_id text;

UPDATE cmmc_documents
   SET organization_id = (SELECT id FROM organizations WHERE slug = 'mactech' LIMIT 1)
 WHERE organization_id IS NULL;

DO $$
DECLARE
  unscoped_count int;
BEGIN
  SELECT count(*) INTO unscoped_count FROM cmmc_documents WHERE organization_id IS NULL;
  IF unscoped_count > 0 THEN
    RAISE EXCEPTION 'cmmc_documents backfill incomplete: % rows still NULL', unscoped_count;
  END IF;
END $$;

ALTER TABLE cmmc_documents
  ALTER COLUMN organization_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cmmc_documents_organization_id_fkey'
  ) THEN
    ALTER TABLE cmmc_documents
      ADD CONSTRAINT cmmc_documents_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cmmc_documents_organization_id_idx ON cmmc_documents(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3b: cmmc_documents.effective_date — added so the codex CMMC contract
-- never has to runtime-parse cmmc_revisions.date (string) at request time.
-- A null here makes the synthesis fall through to "no cadence on file" honestly,
-- rather than silently passing adjudication.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cmmc_documents
  ADD COLUMN IF NOT EXISTS effective_date DATE;

-- Backfill from the latest revision (matches the existing "orderBy createdAt desc, take 1"
-- pattern used everywhere in cmmc.js). Soft-fail on parse: leave NULL when the
-- string isn't a clean YYYY-MM-DD; bundles get edited by hand and formats drift.
UPDATE cmmc_documents cd
   SET effective_date = (
     SELECT
       CASE
         WHEN cr.date ~ '^\d{4}-\d{2}-\d{2}$' THEN cr.date::date
         ELSE NULL
       END
     FROM cmmc_revisions cr
     WHERE cr.document_id = cd.id
     ORDER BY cr.created_at DESC
     LIMIT 1
   )
 WHERE cd.effective_date IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: CMMC control-tag junction tables.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_cmmc_control_tags (
  document_id    text NOT NULL,
  control_id     text NOT NULL,
  coverage_note  text,
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, control_id),
  CONSTRAINT document_cmmc_control_tags_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS document_cmmc_control_tags_control_id_idx
  ON document_cmmc_control_tags(control_id);

CREATE TABLE IF NOT EXISTS cmmc_document_control_tags (
  cmmc_document_id  text NOT NULL,
  control_id        text NOT NULL,
  coverage_note     text,
  created_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cmmc_document_id, control_id),
  CONSTRAINT cmmc_document_control_tags_cmmc_document_id_fkey
    FOREIGN KEY (cmmc_document_id) REFERENCES cmmc_documents(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS cmmc_document_control_tags_control_id_idx
  ON cmmc_document_control_tags(control_id);

COMMIT;

-- Verify post-migration. Expected: zero NULL org_ids, two junction tables exist.
-- docs_without_effective_date is informational, not a failure — bundles with
-- unparseable date strings legitimately stay NULL and the contract honors that.
SELECT
  (SELECT count(*) FROM documents       WHERE organization_id IS NULL) AS null_doc_orgs,
  (SELECT count(*) FROM cmmc_documents  WHERE organization_id IS NULL) AS null_cmmc_orgs,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name IN ('document_cmmc_control_tags','cmmc_document_control_tags')) AS junction_tables,
  (SELECT count(*) FROM cmmc_documents  WHERE effective_date IS NULL) AS docs_without_effective_date,
  (SELECT count(*) FROM cmmc_documents) AS total_cmmc_docs;
-- Expected: null_doc_orgs=0, null_cmmc_orgs=0, junction_tables=2.
-- docs_without_effective_date is informational; investigate if it equals total_cmmc_docs
-- (means every revision date is unparseable — likely format drift, not a migration bug).
