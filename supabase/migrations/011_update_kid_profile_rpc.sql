-- 011: update_kid_profile RPC + get_family_info RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_kid_profile(
  p_kid_profile_id UUID,
  p_display_name TEXT,
  p_grade TEXT,
  p_avatar_id TEXT DEFAULT 'star',
  p_school_name TEXT DEFAULT NULL,
  p_gender public.gender_type DEFAULT NULL,
  p_chinese_level public.chinese_level DEFAULT 'CL',
  p_ui_lang public.ui_lang DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
BEGIN
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  IF NOT public.profile_belongs_to_current_family(p_kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'Nickname is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE family_id = v_family_id
      AND role = 'kid'
      AND deleted_at IS NULL
      AND lower(trim(display_name)) = lower(trim(p_display_name))
      AND id <> p_kid_profile_id
  ) THEN
    RAISE EXCEPTION 'A profile with this nickname already exists';
  END IF;

  UPDATE public.profiles
  SET
    display_name = trim(p_display_name),
    grade = p_grade,
    avatar_id = COALESCE(NULLIF(trim(p_avatar_id), ''), 'star'),
    school_name = NULLIF(trim(p_school_name), ''),
    gender = p_gender,
    chinese_level = COALESCE(p_chinese_level, 'CL'),
    ui_lang = COALESCE(p_ui_lang, ui_lang),
    updated_at = now()
  WHERE id = p_kid_profile_id
    AND role = 'kid'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_kid_profile(
  UUID, TEXT, TEXT, TEXT, TEXT, public.gender_type, public.chinese_level, public.ui_lang
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_family_info: returns family plan details for the parent dashboard.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_family_info()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT row_to_json(r) FROM (
    SELECT
      f.id              AS family_id,
      f.account_type,
      f.plan_tier,
      f.created_at,
      se.source         AS entitlement_source,
      se.status         AS entitlement_status,
      se.ends_at        AS trial_ends_at
    FROM public.families f
    LEFT JOIN LATERAL (
      SELECT source, status, ends_at
      FROM public.subscription_entitlements
      WHERE family_id = f.id
        AND status = 'active'
      ORDER BY ends_at DESC NULLS LAST
      LIMIT 1
    ) se ON true
    WHERE f.id = public.current_family_id()
      AND f.deleted_at IS NULL
  ) r;
$$;

GRANT EXECUTE ON FUNCTION public.get_family_info() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- delete_kid_profile: soft-delete a kid profile (family-scoped).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_kid_profile(p_kid_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.profile_belongs_to_current_family(p_kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  UPDATE public.profiles
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_kid_profile_id
    AND role = 'kid'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_kid_profile(UUID) TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
