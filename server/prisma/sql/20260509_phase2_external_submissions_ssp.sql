-- Phase 2 — Codex SSP Doc Control bridge: external submissions schema.
-- Adds:
--   1. SSP value to DocumentType enum
--   2. ExternalSubmissionStatus enum
--   3. external_document_submissions table with idempotency constraint
--
-- Idempotent. Runnable via:  psql $DATABASE_URL -f 20260509_phase2_external_submissions_ssp.sql
-- Single transaction.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: extend DocumentType with SSP. ALTER TYPE … ADD VALUE IF NOT EXISTS
-- is the supported PostgreSQL pattern; safe to re-run.
-- NB: must run outside a transaction in some pg versions, but the IF NOT
-- EXISTS guard makes a no-op safe inside one too. Test on staging first.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'SSP'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')
  ) THEN
    ALTER TYPE "DocumentType" ADD VALUE 'SSP';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: ExternalSubmissionStatus enum
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExternalSubmissionStatus') THEN
    CREATE TYPE "ExternalSubmissionStatus" AS ENUM (
      'PENDING_REVIEW',
      'UNDER_REVIEW',
      'APPROVED',
      'QUALITY_RELEASED',
      'REJECTED'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: external_document_submissions table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS external_document_submissions (
  id                          text PRIMARY KEY,
  external_system             text NOT NULL,
  inbound_bridge_version      text NOT NULL DEFAULT '1',
  external_submission_id      text NOT NULL,
  external_organization_id    text NOT NULL,
  external_document_id        text NOT NULL,
  external_version_number     integer NOT NULL,
  document_number             text NOT NULL,
  document_type               "DocumentType" NOT NULL,
  payload_sha256              text NOT NULL,
  payload_json                jsonb NOT NULL,
  pdf_file_asset_id           text,
  controls_mapped             text[] NOT NULL DEFAULT '{}',
  qms_document_id             text,
  status                      "ExternalSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  rejected_at                 timestamp(3),
  rejected_by_id              text,
  rejection_reason            text,
  superseded_by_submission_id text,
  submitted_at                timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at                  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT external_document_submissions_pdf_file_asset_id_fkey
    FOREIGN KEY (pdf_file_asset_id) REFERENCES file_assets(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT external_document_submissions_qms_document_id_fkey
    FOREIGN KEY (qms_document_id) REFERENCES documents(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT external_document_submissions_rejected_by_id_fkey
    FOREIGN KEY (rejected_by_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT external_document_submissions_superseded_by_fkey
    FOREIGN KEY (superseded_by_submission_id) REFERENCES external_document_submissions(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- 1:1 uniqueness on the linkage columns (Prisma @unique generates these)
CREATE UNIQUE INDEX IF NOT EXISTS external_document_submissions_pdf_file_asset_id_key
  ON external_document_submissions(pdf_file_asset_id) WHERE pdf_file_asset_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS external_document_submissions_qms_document_id_key
  ON external_document_submissions(qms_document_id) WHERE qms_document_id IS NOT NULL;

-- Idempotency constraint per the contract: a repeat POST with the same
-- (organization_id, ssp_document_id, payload_sha256) returns the existing
-- row with 200 OK rather than creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS external_submission_idempotency
  ON external_document_submissions(external_organization_id, external_document_id, payload_sha256);

CREATE INDEX IF NOT EXISTS external_document_submissions_document_number_idx
  ON external_document_submissions(document_number);
CREATE INDEX IF NOT EXISTS external_document_submissions_status_idx
  ON external_document_submissions(status);
CREATE INDEX IF NOT EXISTS external_document_submissions_external_system_external_subm_idx
  ON external_document_submissions(external_system, external_submission_id);

COMMIT;

-- Verification: expected (1, 1, 0) — SSP enum present, table exists, no rows yet.
SELECT
  (SELECT count(*) FROM pg_enum WHERE enumlabel = 'SSP'
     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')) AS ssp_enum_value,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'external_document_submissions') AS table_exists,
  (SELECT count(*) FROM external_document_submissions) AS submission_count;
-- Expected: (1, 1, 0)
