-- 022: Admin dev RPC — set kid profile level (bypasses forge economy).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_profile_level(
  p_profile_id UUID,
  p_level_no   INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   public.profiles%ROWTYPE;
  v_tier      TEXT;
  v_level_row public.profile_badge_levels%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id is required';
  END IF;

  IF p_level_no IS NULL OR p_level_no < 1 OR p_level_no > 100 THEN
    RAISE EXCEPTION 'level_no must be between 1 and 100';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id
    AND role = 'kid'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  SELECT tier_name INTO v_tier
  FROM public.badge_level_config
  WHERE level_no = p_level_no
    AND is_active = true;

  IF v_tier IS NULL THEN
    v_tier := CASE
      WHEN p_level_no <=  9 THEN 'Bronze'
      WHEN p_level_no <= 24 THEN 'Silver'
      WHEN p_level_no <= 44 THEN 'Gold'
      WHEN p_level_no <= 69 THEN 'Diamond'
      ELSE 'Legend'
    END;
  END IF;

  INSERT INTO public.profile_badge_levels (profile_id, family_id, level_no, tier_name)
  VALUES (p_profile_id, v_profile.family_id, p_level_no, v_tier)
  ON CONFLICT (profile_id) DO UPDATE
  SET level_no   = EXCLUDED.level_no,
      tier_name  = EXCLUDED.tier_name,
      updated_at = now()
  RETURNING * INTO v_level_row;

  PERFORM public._admin_audit(
    'set_profile_level',
    v_profile.family_id,
    p_profile_id,
    jsonb_build_object('level_no', p_level_no, 'tier_name', v_tier)
  );

  RETURN jsonb_build_object(
    'ok',        true,
    'profile_id', p_profile_id,
    'level_no',  v_level_row.level_no,
    'tier_name', v_level_row.tier_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_level(UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
