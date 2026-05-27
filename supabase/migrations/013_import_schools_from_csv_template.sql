-- 013 TEMPLATE: Import schools from CSV content.
-- Usage:
-- 1) Keep this file as a template.
-- 2) Replace INSERT rows in tmp_school_import with parsed CSV rows.
-- 3) Run in Supabase SQL Editor.

BEGIN;

CREATE TEMP TABLE tmp_school_import (
  name TEXT,
  school_type TEXT,
  is_active BOOLEAN DEFAULT true
) ON COMMIT DROP;

-- Example rows (replace with CSV content):
-- INSERT INTO tmp_school_import (name, school_type, is_active) VALUES
--   ('Nan Hua Primary School', 'government', true),
--   ('Nanyang Primary School', 'government-aided', true);

WITH cleaned AS (
  SELECT
    NULLIF(trim(name), '') AS name,
    NULLIF(trim(school_type), '') AS school_type,
    COALESCE(is_active, true) AS is_active
  FROM tmp_school_import
),
valid_rows AS (
  SELECT *
  FROM cleaned
  WHERE name IS NOT NULL
)
INSERT INTO public.schools (name, school_type, is_active)
SELECT name, school_type, is_active
FROM valid_rows
ON CONFLICT (lower(trim(name)))
DO UPDATE
SET school_type = EXCLUDED.school_type,
    is_active = EXCLUDED.is_active,
    updated_at = now();

COMMIT;

