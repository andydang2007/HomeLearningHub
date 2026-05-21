-- =============================================================================
-- Migration 003: Upgrade EXISTING public.profiles (created before parent auth)
-- Run this FIRST if 001 failed with: column "parent_user_id" does not exist
-- Then re-run 001_parent_auth.sql (from line 39 onward, or the full file)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure base table exists (no-op if already there)
CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID        PRIMARY KEY,
    role            TEXT,
    display_name    TEXT,
    grade           TEXT,
    avatar          TEXT        DEFAULT '',
    parent_user_id  UUID,
    parent_pin      TEXT,
    crystal_balance INTEGER     NOT NULL DEFAULT 0,
    gold_balance    INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add any columns missing on older schemas
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role            TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade           TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar          TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_user_id  UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_pin      TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crystal_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gold_balance    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill legacy rows
UPDATE public.profiles
SET role = COALESCE(role, 'kid')
WHERE role IS NULL;

UPDATE public.profiles
SET display_name = COALESCE(NULLIF(display_name, ''), 'Student')
WHERE display_name IS NULL OR display_name = '';

UPDATE public.profiles
SET crystal_balance = COALESCE(crystal_balance, 0)
WHERE crystal_balance IS NULL;

UPDATE public.profiles
SET gold_balance = COALESCE(gold_balance, 0)
WHERE gold_balance IS NULL;

-- Constraints (safe to re-run)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('parent', 'kid'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_parent_user_id_fkey'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_parent_user_id_fkey
            FOREIGN KEY (parent_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_parent ON public.profiles(parent_user_id);
