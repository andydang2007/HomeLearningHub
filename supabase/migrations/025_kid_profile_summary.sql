-- ============================================================
-- 025 — Per-child streak shields + kid profile summary RPC
-- ============================================================
-- For DBs that ran early 023 with family_streak_shields: migrates to per-profile pool.

-- ── 1. Per-child shield table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_streak_shields (
  profile_id        UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  quota_month       TEXT NOT NULL DEFAULT '',
  shields_remaining INT  NOT NULL DEFAULT 0 CHECK (shields_remaining >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_streak_shields IS
  'Premium 每个孩子每月连击护盾（SGT 自然月重置为 3）。';

ALTER TABLE public.profile_streak_shields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_profile_streak_shields ON public.profile_streak_shields;
CREATE POLICY family_read_profile_streak_shields
  ON public.profile_streak_shields FOR SELECT TO authenticated
  USING (public.profile_belongs_to_current_family(profile_id));

-- Seed each premium kid with a full monthly quota (each child owns their own pool).
INSERT INTO public.profile_streak_shields (profile_id, quota_month, shields_remaining)
SELECT p.id, public.streak_shield_quota_month(), public.streak_shield_monthly_quota()
FROM public.profiles p
JOIN public.families f ON f.id = p.family_id
WHERE p.role = 'kid'
  AND p.deleted_at IS NULL
  AND f.plan_tier = 'premium'
  AND f.deleted_at IS NULL
ON CONFLICT (profile_id) DO NOTHING;

-- Retire family-level pool from early 023 builds.
DROP POLICY IF EXISTS family_read_streak_shields ON public.family_streak_shields;
DROP TABLE IF EXISTS public.family_streak_shields;
DROP FUNCTION IF EXISTS public.ensure_family_streak_shields(UUID);

-- ── 2. ensure_profile_streak_shields ──────────────────────────

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

-- ── 3. Streak RPCs (per-child shields) ────────────────────────

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

-- ── 4. get_family_info (read-only, no shield INSERT) ──────────

CREATE OR REPLACE FUNCTION public.get_family_info()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT row_to_json(r) FROM (
    SELECT
      f.id AS family_id,
      f.account_type,
      f.plan_tier,
      se.id AS entitlement_id,
      se.plan_tier AS entitlement_plan_tier,
      se.status AS entitlement_status,
      se.ends_at AS billing_ends_at,
      pc.change_kind AS pending_change_kind,
      pc.target_account_type AS pending_target_account_type,
      pc.target_plan_tier AS pending_target_plan_tier,
      pc.effective_at AS pending_effective_at
    FROM public.families f
    LEFT JOIN LATERAL (
      SELECT id, plan_tier, status, ends_at
      FROM public.subscription_entitlements
      WHERE family_id = f.id
        AND status IN ('active', 'scheduled')
        AND (ends_at IS NULL OR ends_at > now())
      ORDER BY ends_at DESC NULLS LAST
      LIMIT 1
    ) se ON true
    LEFT JOIN public.subscription_pending_changes pc
      ON pc.family_id = f.id
    WHERE f.id = public.current_family_id()
      AND f.deleted_at IS NULL
  ) r;
$$;

-- ── 5. Parent dashboard kid snapshot ──────────────────────────

CREATE OR REPLACE FUNCTION public.get_kid_profile_summary(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_plan      public.plan_tier;
  v_today     DATE := public.sgt_date();
  v_week_ago  DATE := public.sgt_date() - 7;
  v_profile   public.profiles%ROWTYPE;
  v_level     public.profile_badge_levels%ROWTYPE;
  v_streak    public.profile_checkin_streaks%ROWTYPE;
  v_shields   INT := 0;
  v_quota     INT := public.streak_shield_monthly_quota();
  v_sessions_7d INT := 0;
  v_minutes_7d  INT := 0;
  v_sessions_all INT := 0;
  v_badges      INT := 0;
  v_effective_streak INT := 0;
BEGIN
  IF NOT public.profile_belongs_to_current_family(p_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  SELECT plan_tier INTO v_plan FROM public.families WHERE id = v_family_id;

  SELECT * INTO v_level
  FROM public.profile_badge_levels
  WHERE profile_id = p_profile_id;

  SELECT * INTO v_streak
  FROM public.profile_checkin_streaks
  WHERE profile_id = p_profile_id;

  IF v_streak.profile_id IS NOT NULL THEN
    v_effective_streak := COALESCE(v_streak.current_streak, 0);
    IF v_streak.last_checkin_date IS NOT NULL
       AND (v_today - v_streak.last_checkin_date) > 1 THEN
      IF EXISTS (
        SELECT 1 FROM public.profile_streak_break_resolutions
        WHERE profile_id = p_profile_id
          AND missed_after_date = v_streak.last_checkin_date
          AND resolution = 'accept'
      ) THEN
        v_effective_streak := 0;
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.profile_streak_break_resolutions
        WHERE profile_id = p_profile_id
          AND missed_after_date = v_streak.last_checkin_date
      ) THEN
        v_effective_streak := 0;
      END IF;
    END IF;
  END IF;

  IF v_plan = 'premium' THEN
    v_shields := public.ensure_profile_streak_shields(p_profile_id);
  END IF;

  SELECT COUNT(*)::INT, COALESCE(SUM(duration_seconds), 0)::INT
  INTO v_sessions_7d, v_minutes_7d
  FROM public.learning_sessions
  WHERE profile_id = p_profile_id
    AND completed_at IS NOT NULL
    AND practice_date_sgt >= v_week_ago;

  SELECT COUNT(*)::INT INTO v_sessions_all
  FROM public.learning_sessions
  WHERE profile_id = p_profile_id
    AND completed_at IS NOT NULL;

  SELECT COALESCE(SUM(count_lifetime), 0)::INT INTO v_badges
  FROM public.profile_badge_counters
  WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object(
    'profile_id',           p_profile_id,
    'display_name',         v_profile.display_name,
    'grade',                v_profile.grade,
    'avatar_id',            v_profile.avatar_id,
    'level_no',             COALESCE(v_level.level_no, 1),
    'tier_name',            COALESCE(v_level.tier_name, 'Bronze'),
    'current_streak',       COALESCE(v_streak.current_streak, 0),
    'effective_streak',     v_effective_streak,
    'max_streak',           COALESCE(v_streak.max_streak, 0),
    'total_checkin_days',   COALESCE(v_streak.total_checkin_days, 0),
    'sessions_7d',          v_sessions_7d,
    'minutes_7d',           ROUND(v_minutes_7d / 60.0),
    'sessions_total',       v_sessions_all,
    'badges_lifetime',      v_badges,
    'plan_tier',            v_plan::text,
    'streak_shields_remaining', v_shields,
    'streak_shields_quota',     v_quota
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile_streak_shields(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_streak_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_streak_break(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_info() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kid_profile_summary(UUID) TO authenticated;
