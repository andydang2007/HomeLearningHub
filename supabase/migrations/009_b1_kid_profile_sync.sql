-- =============================================================================
-- Migration 009: Phase B1 — extended create_kid_profile + list_kid_profiles
-- Prerequisite: 003, 004, 005, 007.
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_name    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender          TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chinese_level   TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_id       TEXT;

-- Replace 3-arg overload with extended kid profile RPC
DROP FUNCTION IF EXISTS public.create_kid_profile(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_kid_profile(
    p_display_name  TEXT,
    p_grade         TEXT,
    p_avatar_id     TEXT DEFAULT 'star',
    p_school_name   TEXT DEFAULT NULL,
    p_gender        TEXT DEFAULT NULL,
    p_chinese_level TEXT DEFAULT 'CL'
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT COUNT(*) INTO kid_count
    FROM public.profiles
    WHERE parent_user_id = auth.uid() AND role = 'kid';

    IF kid_count >= 3 THEN
        RAISE EXCEPTION 'Maximum 3 kid profiles per parent account';
    END IF;

    -- Idempotent: same parent + display name (case-insensitive) → return existing id
    SELECT id INTO new_id
    FROM public.profiles
    WHERE parent_user_id = auth.uid()
      AND role = 'kid'
      AND lower(trim(display_name)) = lower(trim(p_display_name))
    LIMIT 1;

    IF new_id IS NOT NULL THEN
        UPDATE public.profiles
        SET grade          = COALESCE(p_grade, grade),
            avatar_id      = COALESCE(NULLIF(trim(p_avatar_id), ''), avatar_id, 'star'),
            avatar         = COALESCE(NULLIF(trim(p_avatar_id), ''), avatar, ''),
            school_name    = COALESCE(NULLIF(trim(p_school_name), ''), school_name),
            gender         = COALESCE(NULLIF(trim(p_gender), ''), gender),
            chinese_level  = COALESCE(NULLIF(trim(p_chinese_level), ''), chinese_level, 'CL'),
            updated_at     = now()
        WHERE id = new_id;
        RETURN new_id;
    END IF;

    new_id := gen_random_uuid();
    v_username := COALESCE(
        NULLIF(lower(regexp_replace(p_display_name, '[^a-zA-Z0-9]', '', 'g')), ''),
        'kid'
    ) || '_' || substr(replace(new_id::text, '-', ''), 1, 6);

    INSERT INTO public.profiles (
        id, role, display_name, grade, avatar, avatar_id,
        school_name, gender, chinese_level,
        parent_user_id, username
    )
    VALUES (
        new_id, 'kid', trim(p_display_name), p_grade,
        COALESCE(NULLIF(trim(p_avatar_id), ''), 'star'),
        COALESCE(NULLIF(trim(p_avatar_id), ''), 'star'),
        NULLIF(trim(p_school_name), ''),
        NULLIF(trim(p_gender), ''),
        COALESCE(NULLIF(trim(p_chinese_level), ''), 'CL'),
        auth.uid(), v_username
    );

    RETURN new_id;
END;
$fn$;

-- List kid profiles for the logged-in parent (JSON array for frontend)
CREATE OR REPLACE FUNCTION public.list_kid_profiles()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
DECLARE
    result JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN '[]'::JSON;
    END IF;

    SELECT COALESCE(json_agg(row_to_json(k) ORDER BY k.created_at), '[]'::JSON)
    INTO result
    FROM (
        SELECT
            id,
            display_name,
            grade,
            avatar_id,
            school_name,
            gender,
            chinese_level,
            created_at
        FROM public.profiles
        WHERE parent_user_id = auth.uid()
          AND role = 'kid'
        ORDER BY created_at
    ) k;

    RETURN result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_kid_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_kid_profiles() TO authenticated;
