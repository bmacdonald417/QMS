-- Phase 1a — Rename the existing 'Primary' organization row to MacTech Solutions LLC.
-- Run BEFORE phase1b. Idempotent. Capture the returned id and set MACTECH_DEFAULT_ORG_ID
-- in Railway env before running phase1b.
--
-- Run via:  psql $DATABASE_URL -f 20260505_phase1a_rename_org_to_mactech.sql
-- Or paste into Railway Postgres → Query.
--
-- Why path A (rename in place): preserves every existing organization_memberships FK
-- without re-pointing rows. No semantic split between user-org and doc-org.

BEGIN;

-- 1. Rename if the seed row exists; do nothing if already renamed (idempotent).
UPDATE organizations
   SET name = 'MacTech Solutions LLC',
       slug = 'mactech'
 WHERE slug = 'primary';

-- 2. Sanity check: exactly one MacTech row, no leftover 'primary'.
DO $$
DECLARE
  mactech_count int;
  primary_count int;
BEGIN
  SELECT count(*) INTO mactech_count FROM organizations WHERE slug = 'mactech';
  SELECT count(*) INTO primary_count FROM organizations WHERE slug = 'primary';

  IF mactech_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 organization with slug=mactech, found %', mactech_count;
  END IF;
  IF primary_count <> 0 THEN
    RAISE EXCEPTION 'Stale row with slug=primary still present (%); investigate before continuing', primary_count;
  END IF;
END $$;

-- 3. Return the canonical id. Set this UUID as MACTECH_DEFAULT_ORG_ID in Railway env.
SELECT id, name, slug
  FROM organizations
 WHERE slug = 'mactech';

COMMIT;
