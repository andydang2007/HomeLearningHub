-- =============================================================================
-- 017 · Badge Level-Up System
-- Populates badge_level_config (L1-100) and adds two RPCs:
--   • get_synthesis_data   — page load
--   • level_up_profile     — atomic forge execution
-- =============================================================================

-- ① New ledger reason code
ALTER TYPE public.ledger_reason_code ADD VALUE IF NOT EXISTS 'level_up_spend';

-- ② Seed / upsert badge_level_config for L1–L100
--    Cost formula:
--      badge_cost   = MIN((level_no - 1) × 10, 150)  — L1 has no cost (starting level)
--      crystal_cost = level_no × 2  if level_no % 5 = 0, else 0
DO $$
DECLARE
  lvl  INT;
  t    TEXT;
  bc   INT;
  cc   INT;
BEGIN
  FOR lvl IN 1..100 LOOP
    t := CASE
      WHEN lvl <=  9 THEN 'Bronze'
      WHEN lvl <= 24 THEN 'Silver'
      WHEN lvl <= 44 THEN 'Gold'
      WHEN lvl <= 69 THEN 'Diamond'
      ELSE 'Legend'
    END;
    bc := CASE WHEN lvl = 1 THEN 0 ELSE LEAST((lvl - 1) * 10, 150) END;
    cc := CASE WHEN lvl % 5 = 0 THEN lvl * 2 ELSE 0 END;

    INSERT INTO public.badge_level_config (level_no, tier_name, required_badges, required_crystals)
    VALUES (lvl, t, jsonb_build_object('count', bc), cc)
    ON CONFLICT (level_no) DO UPDATE
      SET tier_name        = EXCLUDED.tier_name,
          required_badges  = EXCLUDED.required_badges,
          required_crystals = EXCLUDED.required_crystals,
          updated_at       = now();
  END LOOP;
END;
$$;

-- ③ get_synthesis_data — returns everything the synthesis page needs in one call
CREATE OR REPLACE FUNCTION public.get_synthesis_data(kid_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id    UUID := public.current_family_id();
  v_level        public.profile_badge_levels%ROWTYPE;
  v_wallet       public.profile_wallets%ROWTYPE;
  v_plan_tier    public.plan_tier;
  v_badges       JSONB;
  v_next_cfg     JSONB;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_level  FROM public.profile_badge_levels WHERE profile_id = kid_profile_id;
  SELECT * INTO v_wallet FROM public.profile_wallets       WHERE profile_id = kid_profile_id;

  SELECT f.plan_tier INTO v_plan_tier
    FROM public.families f
    JOIN public.profiles p ON p.family_id = f.id
    WHERE p.id = kid_profile_id;

  -- Badge inventory: all active badge_definitions + this profile's available count
  -- Always include hidden badges (for the locked/unlocked display), but only
  -- include regular badges that have at least 1 available.
  SELECT jsonb_agg(
    jsonb_build_object(
      'badge_id',        bd.id,
      'badge_code',      bd.badge_code,
      'display_name_en', bd.display_name_en,
      'display_name_zh', bd.display_name_zh,
      'icon',            COALESCE(bd.icon, '🏅'),
      'category',        bd.category,
      'is_hidden',       bd.is_hidden,
      'available',       COALESCE(pbc.count_available, 0),
      'lifetime',        COALESCE(pbc.count_lifetime,  0)
    ) ORDER BY bd.is_hidden, bd.category, bd.display_name_en
  ) INTO v_badges
  FROM public.badge_definitions bd
  LEFT JOIN public.profile_badge_counters pbc
         ON pbc.badge_id = bd.id AND pbc.profile_id = kid_profile_id
  WHERE bd.is_active = true
    AND (bd.is_hidden = true OR COALESCE(pbc.count_available, 0) > 0);

  -- Next level config
  SELECT jsonb_build_object(
    'badge_cost',    COALESCE((required_badges->>'count')::INT, 0),
    'crystal_cost',  COALESCE(required_crystals, 0),
    'tier_name',     tier_name
  ) INTO v_next_cfg
  FROM public.badge_level_config
  WHERE level_no = v_level.level_no + 1;

  RETURN jsonb_build_object(
    'current_level',    v_level.level_no,
    'current_tier',     v_level.tier_name,
    'crystal_balance',  v_wallet.crystal_balance,
    'plan_tier',        v_plan_tier,
    'badges',           COALESCE(v_badges, '[]'::jsonb),
    'next_level_config', v_next_cfg
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_synthesis_data(UUID) TO authenticated;

-- ④ level_up_profile — atomic badge/crystal deduction + level increment
-- Parameters:
--   badge_spend        JSONB        [{badge_id, qty}]  regular badges to spend
--   hidden_as_badges   UUID[]       hidden badge IDs counted as 50 regular badges each
--   hidden_as_crystals UUID[]       hidden badge IDs counted as 10 crystals each
--   crystals_direct    INT          crystals to deduct directly from wallet
CREATE OR REPLACE FUNCTION public.level_up_profile(
  kid_profile_id     UUID,
  badge_spend        JSONB    DEFAULT '[]',
  hidden_as_badges   UUID[]   DEFAULT '{}',
  hidden_as_crystals UUID[]   DEFAULT '{}',
  crystals_direct    INT      DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id   UUID := public.current_family_id();
  v_level       public.profile_badge_levels%ROWTYPE;
  v_wallet      public.profile_wallets%ROWTYPE;
  v_plan_tier   public.plan_tier;
  v_next        INT;
  v_req_badges  INT;
  v_req_crystals INT;
  v_badge_val   INT := 0;
  v_crystal_val INT := 0;
  v_old_tier    TEXT;
  v_new_tier    TEXT;
  v_hid         UUID;
  v_item        JSONB;
  v_bid         UUID;
  v_qty         INT;
  v_avail       INT;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_level  FROM public.profile_badge_levels WHERE profile_id = kid_profile_id FOR UPDATE;
  SELECT * INTO v_wallet FROM public.profile_wallets       WHERE profile_id = kid_profile_id FOR UPDATE;

  SELECT f.plan_tier INTO v_plan_tier
    FROM public.families f JOIN public.profiles p ON p.family_id = f.id
    WHERE p.id = kid_profile_id;

  v_next     := v_level.level_no + 1;
  v_old_tier := v_level.tier_name;

  SELECT COALESCE((required_badges->>'count')::INT, 0),
         COALESCE(required_crystals, 0)
    INTO v_req_badges, v_req_crystals
    FROM public.badge_level_config WHERE level_no = v_next;

  IF v_req_badges IS NULL THEN
    RAISE EXCEPTION 'Level config not found for level %', v_next;
  END IF;

  -- ── Validate premium for hidden badges ──
  IF (array_length(hidden_as_badges,   1) > 0 OR
      array_length(hidden_as_crystals, 1) > 0) AND v_plan_tier != 'premium' THEN
    RAISE EXCEPTION 'Hidden badge substitution requires a Premium plan';
  END IF;

  -- ── Validate + count hidden_as_badges ──
  IF hidden_as_badges IS NOT NULL THEN
    FOREACH v_hid IN ARRAY hidden_as_badges LOOP
      SELECT pbc.count_available INTO v_avail
        FROM public.profile_badge_counters pbc
        JOIN public.badge_definitions bd ON bd.id = pbc.badge_id
        WHERE pbc.profile_id = kid_profile_id AND pbc.badge_id = v_hid
          AND bd.is_hidden = true AND pbc.count_available >= 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Hidden badge not available: %', v_hid;
      END IF;
      v_badge_val := v_badge_val + 50;
    END LOOP;
  END IF;

  -- ── Validate + count hidden_as_crystals ──
  IF hidden_as_crystals IS NOT NULL THEN
    FOREACH v_hid IN ARRAY hidden_as_crystals LOOP
      SELECT pbc.count_available INTO v_avail
        FROM public.profile_badge_counters pbc
        JOIN public.badge_definitions bd ON bd.id = pbc.badge_id
        WHERE pbc.profile_id = kid_profile_id AND pbc.badge_id = v_hid
          AND bd.is_hidden = true AND pbc.count_available >= 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Hidden badge not available: %', v_hid;
      END IF;
      v_crystal_val := v_crystal_val + 10;
    END LOOP;
  END IF;

  -- ── Validate + count regular badge spend ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(badge_spend) LOOP
    v_bid := (v_item->>'badge_id')::UUID;
    v_qty := (v_item->>'qty')::INT;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT pbc.count_available INTO v_avail
      FROM public.profile_badge_counters pbc
      JOIN public.badge_definitions bd ON bd.id = pbc.badge_id
      WHERE pbc.profile_id = kid_profile_id AND pbc.badge_id = v_bid
        AND bd.is_hidden = false AND pbc.count_available >= v_qty;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient badges for %', v_bid;
    END IF;
    v_badge_val := v_badge_val + v_qty;
  END LOOP;

  -- ── Validate totals ──
  IF v_badge_val < v_req_badges THEN
    RAISE EXCEPTION 'Need % badges, only % provided', v_req_badges, v_badge_val;
  END IF;

  v_crystal_val := v_crystal_val + COALESCE(crystals_direct, 0);
  IF v_crystal_val < v_req_crystals THEN
    RAISE EXCEPTION 'Need % crystals, only % provided', v_req_crystals, v_crystal_val;
  END IF;

  IF COALESCE(crystals_direct, 0) > 0 AND v_wallet.crystal_balance < crystals_direct THEN
    RAISE EXCEPTION 'Crystal wallet balance insufficient';
  END IF;

  -- ══ Execute deductions ══

  -- Deduct hidden_as_badges
  IF hidden_as_badges IS NOT NULL THEN
    FOREACH v_hid IN ARRAY hidden_as_badges LOOP
      UPDATE public.profile_badge_counters
        SET count_available = count_available - 1, updated_at = now()
        WHERE profile_id = kid_profile_id AND badge_id = v_hid;
    END LOOP;
  END IF;

  -- Deduct hidden_as_crystals
  IF hidden_as_crystals IS NOT NULL THEN
    FOREACH v_hid IN ARRAY hidden_as_crystals LOOP
      UPDATE public.profile_badge_counters
        SET count_available = count_available - 1, updated_at = now()
        WHERE profile_id = kid_profile_id AND badge_id = v_hid;
    END LOOP;
  END IF;

  -- Deduct regular badges
  FOR v_item IN SELECT * FROM jsonb_array_elements(badge_spend) LOOP
    v_bid := (v_item->>'badge_id')::UUID;
    v_qty := (v_item->>'qty')::INT;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    UPDATE public.profile_badge_counters
      SET count_available = count_available - v_qty, updated_at = now()
      WHERE profile_id = kid_profile_id AND badge_id = v_bid;
  END LOOP;

  -- Deduct crystals from wallet
  IF COALESCE(crystals_direct, 0) > 0 THEN
    UPDATE public.profile_wallets
      SET crystal_balance = crystal_balance - crystals_direct, updated_at = now()
      WHERE profile_id = kid_profile_id;

    INSERT INTO public.wallet_ledger
      (family_id, profile_id, currency, amount, balance_after, reason_code, created_by)
    VALUES
      (v_family_id, kid_profile_id, 'crystal', -crystals_direct,
       v_wallet.crystal_balance - crystals_direct, 'level_up_spend', 'rpc');
  END IF;

  -- Update level
  v_new_tier := CASE
    WHEN v_next <=  9 THEN 'Bronze'
    WHEN v_next <= 24 THEN 'Silver'
    WHEN v_next <= 44 THEN 'Gold'
    WHEN v_next <= 69 THEN 'Diamond'
    ELSE 'Legend'
  END;

  UPDATE public.profile_badge_levels
    SET level_no              = v_next,
        tier_name             = v_new_tier,
        badges_spent_lifetime   = badges_spent_lifetime + v_badge_val,
        crystals_spent_lifetime = crystals_spent_lifetime + COALESCE(crystals_direct, 0),
        updated_at            = now()
    WHERE profile_id = kid_profile_id;

  RETURN jsonb_build_object(
    'success',      true,
    'new_level',    v_next,
    'old_level',    v_level.level_no,
    'new_tier',     v_new_tier,
    'old_tier',     v_old_tier,
    'tier_changed', v_new_tier <> v_old_tier
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.level_up_profile(UUID, JSONB, UUID[], UUID[], INT) TO authenticated;
