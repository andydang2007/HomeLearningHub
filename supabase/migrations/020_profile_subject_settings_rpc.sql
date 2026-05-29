-- 020: Parent read/write per-kid subject accuracy settings (profile_subject_settings).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_kid_subject_settings(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.profile_belongs_to_current_family(p_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'subject', subject,
        'base_accuracy_pct', base_accuracy_pct,
        'target_accuracy_pct', target_accuracy_pct,
        'target_time_seconds', target_time_seconds
      )
      ORDER BY subject
    )
    FROM public.profile_subject_settings
    WHERE profile_id = p_profile_id
      AND subject IN ('english', 'math', 'science', 'chinese')
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_kid_subject_settings(
  p_profile_id UUID,
  p_settings JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_subject public.subject_code;
  v_base INT;
  v_target INT;
  v_time INT;
BEGIN
  IF NOT public.profile_belongs_to_current_family(p_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'array' THEN
    RAISE EXCEPTION 'Settings payload must be a JSON array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_settings)
  LOOP
    v_subject := (v_row->>'subject')::public.subject_code;
    IF v_subject IS NULL OR v_subject NOT IN ('english', 'math', 'science', 'chinese') THEN
      RAISE EXCEPTION 'Invalid subject in settings payload';
    END IF;

    v_base := (v_row->>'base_accuracy_pct')::INT;
    v_target := (v_row->>'target_accuracy_pct')::INT;
    IF v_base IS NULL OR v_target IS NULL
       OR v_base < 0 OR v_base > 100 OR v_target < 0 OR v_target > 100 THEN
      RAISE EXCEPTION 'Accuracy must be integers between 0 and 100';
    END IF;

    IF v_row ? 'target_time_seconds' AND v_row->>'target_time_seconds' IS NOT NULL
       AND trim(v_row->>'target_time_seconds') <> '' THEN
      v_time := (v_row->>'target_time_seconds')::INT;
      IF v_time IS NULL OR v_time <= 0 THEN
        RAISE EXCEPTION 'Target time must be a positive integer (seconds)';
      END IF;
    ELSE
      v_time := NULL;
    END IF;

    UPDATE public.profile_subject_settings
    SET
      base_accuracy_pct = v_base,
      target_accuracy_pct = v_target,
      target_time_seconds = v_time,
      updated_at = now()
    WHERE profile_id = p_profile_id
      AND subject = v_subject;

    IF NOT FOUND THEN
      INSERT INTO public.profile_subject_settings (
        profile_id, subject, base_accuracy_pct, target_accuracy_pct, target_time_seconds
      )
      VALUES (p_profile_id, v_subject, v_base, v_target, v_time);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kid_subject_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_kid_subject_settings(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
