-- 012: Prepare schools table for CSV imports (dedupe + fast lookup).

BEGIN;

-- Prevent duplicate school names (case/space insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS schools_name_normalized_uniq
ON public.schools (lower(trim(name)));

-- Improve autocomplete search by active flag and name ordering.
CREATE INDEX IF NOT EXISTS schools_active_name_idx
ON public.schools (is_active, name);

COMMIT;

