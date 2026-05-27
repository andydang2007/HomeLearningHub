-- ============================================================
-- 018 — Cloud-side checkin streak storage
-- ============================================================
-- Persists each registered kid's daily-checkin streak so that
-- the data survives device switches and falls back gracefully.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_checkin_streaks (
  profile_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id          UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  current_streak     INT  NOT NULL DEFAULT 0,
  max_streak         INT  NOT NULL DEFAULT 0,
  last_checkin_date  DATE,
  total_checkin_days INT  NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_checkin_streaks IS
  '每个注册 kid 的每日打卡连击数据（云端权威来源）。'
  ' current_streak = 当前连击天数；'
  ' max_streak = 历史最高连击；'
  ' last_checkin_date = 最后一次打卡 SGT 日期；'
  ' total_checkin_days = 累计打卡天数。';

-- ── 2. RLS ────────────────────────────────────────────────────
ALTER TABLE public.profile_checkin_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY family_all_checkin_streaks
  ON public.profile_checkin_streaks
  FOR ALL
  TO authenticated
  USING  (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- ── 3. RPC — read ─────────────────────────────────────────────
-- Returns the cloud streak row as JSONB, or an empty object {}
-- if the profile has never synced yet.
CREATE OR REPLACE FUNCTION public.get_checkin_streak(kid_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profile_checkin_streaks%ROWTYPE;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  SELECT * INTO v_row
  FROM public.profile_checkin_streaks
  WHERE profile_id = kid_profile_id;

  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'current_streak',     v_row.current_streak,
    'max_streak',         v_row.max_streak,
    'last_checkin_date',  v_row.last_checkin_date,
    'total_checkin_days', v_row.total_checkin_days
  );
END;
$$;

-- ── 4. RPC — write ────────────────────────────────────────────
-- Called by the frontend whenever local streak data changes
-- (initial sync or after a new checkin).
--
-- Conflict resolution: always take the *higher* value so we
-- never accidentally lose data from another device.
CREATE OR REPLACE FUNCTION public.upsert_checkin_streak(
  kid_profile_id       UUID,
  p_current_streak     INT,
  p_max_streak         INT,
  p_last_checkin_date  DATE,
  p_total_checkin_days INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_row       public.profile_checkin_streaks%ROWTYPE;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  INSERT INTO public.profile_checkin_streaks (
    profile_id, family_id,
    current_streak, max_streak, last_checkin_date, total_checkin_days,
    updated_at
  )
  VALUES (
    kid_profile_id, v_family_id,
    p_current_streak, p_max_streak, p_last_checkin_date, p_total_checkin_days,
    now()
  )
  ON CONFLICT (profile_id) DO UPDATE
    SET current_streak     = GREATEST(EXCLUDED.current_streak,     profile_checkin_streaks.current_streak),
        max_streak         = GREATEST(EXCLUDED.max_streak,         profile_checkin_streaks.max_streak),
        total_checkin_days = GREATEST(EXCLUDED.total_checkin_days, profile_checkin_streaks.total_checkin_days),
        -- Use the more recent date
        last_checkin_date  = GREATEST(EXCLUDED.last_checkin_date,  profile_checkin_streaks.last_checkin_date),
        updated_at         = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'current_streak',     v_row.current_streak,
    'max_streak',         v_row.max_streak,
    'last_checkin_date',  v_row.last_checkin_date,
    'total_checkin_days', v_row.total_checkin_days
  );
END;
$$;

-- ── 5. Grants ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_checkin_streak(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_checkin_streak(UUID, INT, INT, DATE, INT) TO authenticated;
