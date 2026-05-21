-- =============================================================================
-- Migration 001: Parent Auth, Profiles, & PIN RPCs
-- =============================================================================
-- Run this in: Supabase Dashboard → SQL Editor
-- Or via Supabase CLI: supabase db push
--
-- Tables affected:
--   public.profiles  (new)
-- RPCs created:
--   handle_new_user()          — trigger on auth.users INSERT
--   verify_parent_pin(raw_pin) — client calls to check PIN
--   set_parent_pin(raw_pin)    — client calls to set/update PIN
--   check_pin_exists()         — client calls to know if PIN already set
-- =============================================================================

-- Requires pgcrypto for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. profiles table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID        PRIMARY KEY,
    role            TEXT        NOT NULL CHECK (role IN ('parent', 'kid')),
    display_name    TEXT        NOT NULL,
    grade           TEXT,                         -- P1-P6, null for parents
    avatar          TEXT        DEFAULT '',
    parent_user_id  UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_pin      TEXT,                         -- SHA-256 hash, parents only
    crystal_balance INTEGER     NOT NULL DEFAULT 0,
    gold_balance    INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade columns when profiles table already existed (older shop schema)
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

UPDATE public.profiles SET role = COALESCE(role, 'kid') WHERE role IS NULL;
UPDATE public.profiles SET display_name = COALESCE(NULLIF(display_name, ''), 'Student')
    WHERE display_name IS NULL OR display_name = '';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('parent', 'kid'));

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_parent ON public.profiles(parent_user_id);

-- =============================================================================
-- 2. Row-Level Security
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_select_own" ON public.profiles;
CREATE POLICY "parent_select_own"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "parent_select_kids" ON public.profiles;
CREATE POLICY "parent_select_kids"
    ON public.profiles FOR SELECT
    USING (auth.uid() = parent_user_id);

DROP POLICY IF EXISTS "parent_update_own" ON public.profiles;
CREATE POLICY "parent_update_own"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- =============================================================================
-- 3. Auto-create parent profile row on signup (trigger)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (
        NEW.id,
        'parent',
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 4. RPC: verify_parent_pin
--    Frontend sends raw PIN string → returns boolean.
--    The hash is NEVER returned to the client.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_parent_pin(raw_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    -- Only works for authenticated parents
    SELECT parent_pin INTO stored_hash
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'parent';

    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN stored_hash = encode(digest(convert_to(raw_pin, 'UTF8'), 'sha256'), 'hex');
END;
$$;

-- =============================================================================
-- 5. RPC: set_parent_pin
--    Saves a new (or updated) PIN as a SHA-256 hash.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_parent_pin(raw_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF length(raw_pin) <> 4 OR raw_pin !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'PIN must be exactly 4 digits';
    END IF;

    UPDATE public.profiles
    SET parent_pin = encode(digest(convert_to(raw_pin, 'UTF8'), 'sha256'), 'hex'),
        updated_at = now()
    WHERE id = auth.uid() AND role = 'parent';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent profile not found';
    END IF;
END;
$$;

-- =============================================================================
-- 6. RPC: check_pin_exists
--    Returns true if the parent has already set a PIN.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_pin_exists()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'parent'
          AND parent_pin IS NOT NULL
    );
END;
$$;

-- =============================================================================
-- 7. RPC: create_kid_profile  (Phase B — used when parent links a local kid)
--    Returns the new kid's UUID.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_kid_profile(
    p_display_name TEXT,
    p_grade        TEXT,
    p_avatar       TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    kid_count INT;
    new_id    UUID;
BEGIN
    SELECT COUNT(*) INTO kid_count
    FROM public.profiles
    WHERE parent_user_id = auth.uid() AND role = 'kid';

    IF kid_count >= 3 THEN
        RAISE EXCEPTION 'Maximum 3 kid profiles per parent account';
    END IF;

    new_id := gen_random_uuid();

    INSERT INTO public.profiles (id, role, display_name, grade, avatar, parent_user_id)
    VALUES (new_id, 'kid', p_display_name, p_grade, p_avatar, auth.uid());

    RETURN new_id;
END;
$$;

-- Allow logged-in parents to call auth RPCs from the browser
GRANT EXECUTE ON FUNCTION public.verify_parent_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_parent_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_pin_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_kid_profile(TEXT, TEXT, TEXT) TO authenticated;
