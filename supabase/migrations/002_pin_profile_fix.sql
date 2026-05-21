-- =============================================================================
-- Migration 002: Fix PIN save when parent profile row is missing
-- Run AFTER 003 + 004. If username NOT NULL errors, run 005 instead.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_parent_pin(raw_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name     TEXT;
    v_email    TEXT;
    v_username TEXT;
BEGIN
    IF length(raw_pin) <> 4 OR raw_pin !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'PIN must be exactly 4 digits';
    END IF;

    SELECT
        COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), 'Parent'),
        u.email
    INTO v_name, v_email
    FROM auth.users u
    WHERE u.id = auth.uid();

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_username := COALESCE(
        NULLIF(trim(split_part(COALESCE(v_email, ''), '@', 1)), ''),
        NULLIF(lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g')), ''),
        'parent_' || substr(replace(auth.uid()::text, '-', ''), 1, 8)
    );

    INSERT INTO public.profiles (id, role, display_name, username)
    VALUES (auth.uid(), 'parent', v_name, v_username)
    ON CONFLICT (id) DO UPDATE SET
        role         = 'parent',
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        username     = COALESCE(public.profiles.username, EXCLUDED.username),
        updated_at   = now();

    UPDATE public.profiles
    SET parent_pin = encode(digest(convert_to(raw_pin, 'UTF8'), 'sha256'), 'hex'),
        updated_at = now()
    WHERE id = auth.uid() AND role = 'parent';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent profile not found';
    END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_parent_pin(TEXT) TO authenticated;
