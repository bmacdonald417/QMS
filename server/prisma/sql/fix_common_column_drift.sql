-- Fix common PostgreSQL drift when the app is newer than the database.
-- Run against production (Railway: Postgres → Query, or: psql $DATABASE_URL -f this file).
-- PostgreSQL 11+ required for ADD COLUMN IF NOT EXISTS.
-- Safe to run multiple times.

-- Document detail / list (Prisma selects all Document scalars)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS next_review_date TIMESTAMP(3);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_under_review BOOLEAN NOT NULL DEFAULT false;

-- Assignments on document detail (JSON review checklist)
ALTER TABLE document_assignments ADD COLUMN IF NOT EXISTS review_responses JSONB;

-- Users (auth / assignments join — often added after first deploy)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;
