-- =============================================================================
-- Migration 004: Policies, trigger, PIN RPCs (run AFTER 003 succeeded)
-- Use this instead of re-running full 001 if you get "syntax error at end of input"
-- Copy the ENTIRE file, then Run once in Supabase SQL Editor.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── RLS ───────────────────────────────────────────────────────────────────────
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

-- ── Signup trigger ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name     TEXT;
    v_username TEXT;
BEGIN
    v_name := COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        split_part(NEW.email, '@', 1),
        'Parent'
    );
    v_username := COALESCE(
        NULLIF(trim(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
        NULLIF(lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g')), ''),
        'parent_' || substr(replace(NEW.id::text, '-', ''), 1, 8)
    );

    INSERT INTO public.profiles (id, role, display_name, username)
    VALUES (NEW.id, 'parent', v_name, v_username)
    ON CONFLICT (id) DO UPDATE SET
        role         = 'parent',
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        username     = COALESCE(public.profiles.username, EXCLUDED.username),
        updated_at   = now();
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── verify_parent_pin ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_parent_pin(raw_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    stored_hash TEXT;
    input_hash  TEXT;
BEGIN
    SELECT parent_pin INTO stored_hash
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'parent';

    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    input_hash := encode(digest(convert_to(raw_pin, 'UTF8'), 'sha256'), 'hex');
    RETURN stored_hash = input_hash;
END;
$fn$;

-- ── check_pin_exists ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_pin_exists()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'parent'
          AND parent_pin IS NOT NULL
    );
END;
$fn$;

-- ── create_kid_profile ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_kid_profile(
    p_display_name TEXT,
    p_grade        TEXT,
    p_avatar       TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    kid_count  INT;
    new_id     UUID;
    v_username TEXT;
BEGIN
    SELECT COUNT(*) INTO kid_count
    FROM public.profiles
    WHERE parent_user_id = auth.uid() AND role = 'kid';

    IF kid_count >= 3 THEN
        RAISE EXCEPTION 'Maximum 3 kid profiles per parent account';
    END IF;

    new_id := gen_random_uuid();
    v_username := COALESCE(
        NULLIF(lower(regexp_replace(p_display_name, '[^a-zA-Z0-9]', '', 'g')), ''),
        'kid'
    ) || '_' || substr(replace(new_id::text, '-', ''), 1, 6);

    INSERT INTO public.profiles (id, role, display_name, grade, avatar, parent_user_id, username)
    VALUES (new_id, 'kid', p_display_name, p_grade, p_avatar, auth.uid(), v_username);

    RETURN new_id;
END;
$fn$;

-- ── Grants ──────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.verify_parent_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_pin_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_kid_profile(TEXT, TEXT, TEXT) TO authenticated;
