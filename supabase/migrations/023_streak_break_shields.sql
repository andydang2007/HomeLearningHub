-- ============================================================
-- 023 — Streak break detection (SGT) + Premium monthly shields
-- ============================================================

-- ── 1. Tables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_streak_shields (
  profile_id        UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  quota_month       TEXT NOT NULL DEFAULT '',
  shields_remaining INT  NOT NULL DEFAULT 0 CHECK (shields_remaining >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_streak_shields IS
  'Premium 每个孩子每月连击护盾（SGT 自然月重置为 3）。';

CREATE TABLE IF NOT EXISTS public.profile_streak_break_resolutions (
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  missed_after_date DATE NOT NULL,
  resolution        TEXT NOT NULL CHECK (resolution IN ('shield', 'accept')),
  streak_before     INT  NOT NULL DEFAULT 0,
  family_id         UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, missed_after_date)
);

COMMENT ON TABLE public.profile_streak_break_resolutions IS
  '每个孩子每次连击中断（按 last_checkin_date 标识）的处理结果：accept=清零，shield=保留。';

ALTER TABLE public.profile_streak_shields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_streak_break_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY family_read_profile_streak_shields
  ON public.profile_streak_shields FOR SELECT TO authenticated
  USING (public.profile_belongs_to_current_family(profile_id));

CREATE POLICY family_read_streak_break_resolutions
  ON public.profile_streak_break_resolutions FOR SELECT TO authenticated
  USING (family_id = public.current_family_id());

-- ── 2. Constants / helpers ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.streak_shield_monthly_quota()
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 3; $$;

CREATE OR REPLACE FUNCTION public.streak_shield_quota_month(p_day DATE DEFAULT public.sgt_date())
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT to_char(p_day, 'YYYY-MM'); $$;

CREATE OR REPLACE FUNCTION public.ensure_profile_streak_shields(p_profile_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan      public.plan_tier;
  v_month     TEXT := public.streak_shield_quota_month();
  v_quota     INT  := public.streak_shield_monthly_quota();
  v_remaining INT;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT public.profile_belongs_to_current_family(p_profile_id) THEN
    RETURN 0;
  END IF;

  SELECT f.plan_tier INTO v_plan
  FROM public.profiles p
  JOIN public.families f ON f.id = p.family_id
  WHERE p.id = p_profile_id
    AND p.deleted_at IS NULL
    AND f.deleted_at IS NULL;

  IF v_plan IS DISTINCT FROM 'premium' THEN
    RETURN 0;
  END IF;

  INSERT INTO public.profile_streak_shields (profile_id, quota_month, shields_remaining)
  VALUES (p_profile_id, v_month, v_quota)
  ON CONFLICT (profile_id) DO UPDATE
    SET shields_remaining = CASE
          WHEN public.profile_streak_shields.quota_month IS DISTINCT FROM EXCLUDED.quota_month
            THEN v_quota
          ELSE public.profile_streak_shields.shields_remaining
        END,
        quota_month = EXCLUDED.quota_month,
        updated_at  = now()
  RETURNING shields_remaining INTO v_remaining;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- ── 3. get_streak_status — read + break detection ─────────────

CREATE OR REPLACE FUNCTION public.get_streak_status(kid_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id   UUID := public.current_family_id();
  v_plan        public.plan_tier;
  v_today       DATE := public.sgt_date();
  v_row         public.profile_checkin_streaks%ROWTYPE;
  v_last        DATE;
  v_gap         INT;
  v_effective   INT;
  v_at_risk     INT;
  v_broken      BOOLEAN := false;
  v_pending     BOOLEAN := false;
  v_resolution  TEXT;
  v_shields     INT := 0;
  v_quota       INT := public.streak_shield_monthly_quota();
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  SELECT plan_tier INTO v_plan FROM public.families WHERE id = v_family_id;

  IF v_plan = 'premium' THEN
    v_shields := public.ensure_profile_streak_shields(kid_profile_id);
  END IF;

  SELECT * INTO v_row
  FROM public.profile_checkin_streaks
  WHERE profile_id = kid_profile_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'current_streak',     0,
      'max_streak',         0,
      'last_checkin_date',  NULL,
      'total_checkin_days', 0,
      'today_sgt',          v_today,
      'effective_streak',   0,
      'streak_at_risk',     0,
      'is_broken',          false,
      'break_pending',      false,
      'plan_tier',          v_plan::text,
      'shields_remaining',  v_shields,
      'shields_quota',      v_quota,
      'shield_quota_month', public.streak_shield_quota_month()
    );
  END IF;

  v_last      := v_row.last_checkin_date;
  v_at_risk   := COALESCE(v_row.current_streak, 0);
  v_effective := v_at_risk;

  IF v_last IS NULL THEN
    v_gap := NULL;
  ELSE
    v_gap := v_today - v_last;
  END IF;

  IF v_gap IS NOT NULL AND v_gap > 1 THEN
    v_broken := true;

    SELECT resolution INTO v_resolution
    FROM public.profile_streak_break_resolutions
    WHERE profile_id = kid_profile_id
      AND missed_after_date = v_last;

    IF v_resolution IS NULL THEN
      v_pending   := true;
      v_effective := 0;
    ELSIF v_resolution = 'accept' THEN
      v_effective := 0;
    ELSE
      v_effective := v_at_risk;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'current_streak',     v_row.current_streak,
    'max_streak',         v_row.max_streak,
    'last_checkin_date',  v_row.last_checkin_date,
    'total_checkin_days', v_row.total_checkin_days,
    'today_sgt',          v_today,
    'effective_streak',   v_effective,
    'streak_at_risk',     CASE WHEN v_broken THEN v_at_risk ELSE 0 END,
    'is_broken',          v_broken,
    'break_pending',      v_pending,
    'plan_tier',          v_plan::text,
    'shields_remaining',  v_shields,
    'shields_quota',      v_quota,
    'shield_quota_month', public.streak_shield_quota_month()
  );
END;
$$;

-- ── 4. resolve_streak_break ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_streak_break(
  kid_profile_id UUID,
  p_action       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_plan      public.plan_tier;
  v_today     DATE := public.sgt_date();
  v_row       public.profile_checkin_streaks%ROWTYPE;
  v_last      DATE;
  v_gap       INT;
  v_action    TEXT := lower(trim(COALESCE(p_action, '')));
  v_shields   INT;
  v_yesterday DATE := v_today - 1;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  IF v_action NOT IN ('shield', 'accept') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  SELECT * INTO v_row
  FROM public.profile_checkin_streaks
  WHERE profile_id = kid_profile_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.last_checkin_date IS NULL THEN
    RAISE EXCEPTION 'No streak to resolve';
  END IF;

  v_last := v_row.last_checkin_date;
  v_gap  := v_today - v_last;

  IF v_gap <= 1 THEN
    RAISE EXCEPTION 'Streak is not broken';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profile_streak_break_resolutions
    WHERE profile_id = kid_profile_id AND missed_after_date = v_last
  ) THEN
    RAISE EXCEPTION 'Break already resolved';
  END IF;

  SELECT plan_tier INTO v_plan FROM public.families WHERE id = v_family_id;

  IF v_action = 'shield' THEN
    IF v_plan IS DISTINCT FROM 'premium' THEN
      RAISE EXCEPTION 'Premium required for streak shield';
    END IF;

    v_shields := public.ensure_profile_streak_shields(kid_profile_id);
    IF v_shields < 1 THEN
      RAISE EXCEPTION 'No streak shields remaining this month';
    END IF;

    UPDATE public.profile_streak_shields
    SET shields_remaining = shields_remaining - 1,
        updated_at = now()
    WHERE profile_id = kid_profile_id;

    UPDATE public.profile_checkin_streaks
    SET last_checkin_date = v_yesterday,
        updated_at = now()
    WHERE profile_id = kid_profile_id;

    INSERT INTO public.profile_streak_break_resolutions (
      profile_id, missed_after_date, resolution, streak_before, family_id
    ) VALUES (
      kid_profile_id, v_last, 'shield', v_row.current_streak, v_family_id
    );
  ELSE
    UPDATE public.profile_checkin_streaks
    SET current_streak = 0,
        updated_at = now()
    WHERE profile_id = kid_profile_id;

    INSERT INTO public.profile_streak_break_resolutions (
      profile_id, missed_after_date, resolution, streak_before, family_id
    ) VALUES (
      kid_profile_id, v_last, 'accept', v_row.current_streak, v_family_id
    );
  END IF;

  RETURN public.get_streak_status(kid_profile_id);
END;
$$;

-- ── 5. Grants ─────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.streak_shield_monthly_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile_streak_shields(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_streak_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_streak_break(UUID, TEXT) TO authenticated;
