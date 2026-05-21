-- =============================================================================
-- Migration 008: Kid profile fields (school, gender, Chinese stream, avatar_id)
-- Phase A: school_name is free text; school_id FK comes with MOE list later.
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_name    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender          TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chinese_level   TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_id       TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check
    CHECK (gender IS NULL OR gender IN ('M', 'F'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_chinese_level_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_chinese_level_check
    CHECK (chinese_level IS NULL OR chinese_level IN ('CL', 'HCL', 'FCL'));

COMMENT ON COLUMN public.profiles.school_name IS 'Free text until public.schools MOE list ships';
COMMENT ON COLUMN public.profiles.chinese_level IS 'CL=华文, HCL=高级华文, FCL=基础华文 (later)';
