-- ============================================================
-- 019 — Admin / Dev Test RPCs
-- ============================================================
-- Restricted to emails listed in public.admin_users.
-- These functions bypass normal write-isolation rules and are
-- intended ONLY for development and manual data correction.
-- DO NOT expose these RPCs to end-user UI flows.
-- ============================================================

-- ── 1. Admin allow-list ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  email TEXT PRIMARY KEY
);
COMMENT ON TABLE public.admin_users IS
  '开发 / 运营管理员邮箱白名单。所有 admin_* RPC 都先校验此表。';

-- Seed the developer account (add more rows via SQL as needed)
INSERT INTO public.admin_users (email)
VALUES ('andydang2007@gmail.com')
ON CONFLICT DO NOTHING;

-- RLS: only admins can read the table itself
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_self ON public.admin_users
  FOR SELECT TO authenticated
  USING (email = auth.email());

-- ── 2. is_admin() helper ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE email = auth.email()
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ── 3. admin_find_user_by_email ───────────────────────────────
-- Searches auth.users by email, returns family + kid profiles
-- with wallet balances and current level.
CREATE OR REPLACE FUNCTION public.admin_find_user_by_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id  UUID;
  v_family   public.families%ROWTYPE;
  v_profiles JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'error', 'user not found');
  END IF;

  SELECT * INTO v_family FROM public.families WHERE owner_user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', true, 'user_id', v_user_id,
                              'email', lower(p_email), 'family_id', NULL);
  END IF;

  -- Wrap in subquery to avoid PL/pgSQL parser confusion with ORDER BY inside jsonb_agg
  SELECT INTO v_profiles
    (SELECT jsonb_agg(row_data)
     FROM (
       SELECT jsonb_build_object(
         'id',              p.id,
         'display_name',    p.display_name,
         'grade',           p.grade,
         'avatar_id',       p.avatar_id,
         'crystal_balance', COALESCE(w.crystal_balance, 0),
         'coin_balance',    COALESCE(w.coin_balance, 0),
         'level_no',        COALESCE(bl.level_no, 1),
         'tier_name',       COALESCE(bl.tier_name, 'Bronze'),
         'badge_total',     COALESCE(bc.badge_total, 0)
       ) AS row_data
       FROM public.profiles p
       LEFT JOIN public.profile_wallets w
         ON w.profile_id = p.id
       LEFT JOIN public.profile_badge_levels bl
         ON bl.profile_id = p.id
       LEFT JOIN (
         SELECT profile_id, SUM(count_available)::INT AS badge_total
         FROM   public.profile_badge_counters
         GROUP  BY profile_id
       ) bc ON bc.profile_id = p.id
       WHERE p.family_id = v_family.id
         AND p.role = 'kid'
         AND p.deleted_at IS NULL
       ORDER BY p.display_name
     ) sub
    );

  RETURN jsonb_build_object(
    'found',        true,
    'user_id',      v_user_id,
    'email',        lower(p_email),
    'family_id',    v_family.id,
    'account_type', v_family.account_type::text,
    'plan_tier',    v_family.plan_tier::text,
    'profiles',     COALESCE(v_profiles, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_find_user_by_email(TEXT) TO authenticated;

-- ── 4. admin_set_family_plan ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_family_plan(
  p_family_id    UUID,
  p_plan_tier    public.plan_tier,
  p_account_type public.account_type
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE public.families
  SET plan_tier    = p_plan_tier,
      account_type = p_account_type,
      updated_at   = now()
  WHERE id = p_family_id;

  -- Also update any active entitlement row so the app reads it consistently
  UPDATE public.subscription_entitlements
  SET plan_tier    = p_plan_tier,
      account_type = p_account_type,
      updated_at   = now()
  WHERE family_id  = p_family_id
    AND status     = 'active';
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_family_plan(UUID, public.plan_tier, public.account_type) TO authenticated;

-- ── 5. admin_set_badge_count ──────────────────────────────────
-- Sets count_available (and count_lifetime to max of new/old).
CREATE OR REPLACE FUNCTION public.admin_set_badge_count(
  p_profile_id UUID,
  p_badge_code TEXT,
  p_count      INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge_id  UUID;
  v_family_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  IF p_count < 0 THEN
    RAISE EXCEPTION 'count must be >= 0';
  END IF;

  SELECT id INTO v_badge_id
  FROM   public.badge_definitions
  WHERE  badge_code = p_badge_code AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'badge_code not found: ' || p_badge_code);
  END IF;

  SELECT family_id INTO v_family_id
  FROM   public.profiles WHERE id = p_profile_id;

  INSERT INTO public.profile_badge_counters
    (profile_id, family_id, badge_id, count_available, count_lifetime)
  VALUES
    (p_profile_id, v_family_id, v_badge_id, p_count, p_count)
  ON CONFLICT (profile_id, badge_id) DO UPDATE
    SET count_available = p_count,
        count_lifetime  = GREATEST(p_count, profile_badge_counters.count_lifetime),
        updated_at      = now();

  RETURN jsonb_build_object('ok', true, 'badge_code', p_badge_code, 'count', p_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_badge_count(UUID, TEXT, INT) TO authenticated;

-- ── 6. admin_set_wallet ───────────────────────────────────────
-- Directly sets crystal and coin balances (records system_correction).
CREATE OR REPLACE FUNCTION public.admin_set_wallet(
  p_profile_id UUID,
  p_crystals   INT,
  p_coins      INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_wallet    public.profile_wallets%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT family_id INTO v_family_id FROM public.profiles WHERE id = p_profile_id;

  UPDATE public.profile_wallets
  SET crystal_balance = p_crystals,
      coin_balance    = p_coins,
      updated_at      = now()
  WHERE profile_id = p_profile_id
  RETURNING * INTO v_wallet;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wallet not found');
  END IF;

  -- Audit trail
  INSERT INTO public.wallet_ledger
    (family_id, profile_id, currency, amount, balance_after, reason_code, created_by)
  VALUES
    (v_family_id, p_profile_id, 'crystal', p_crystals, p_crystals, 'system_correction', 'admin'),
    (v_family_id, p_profile_id, 'coin',    p_coins,    p_coins,    'system_correction', 'admin');

  RETURN jsonb_build_object(
    'ok',             true,
    'crystal_balance', v_wallet.crystal_balance,
    'coin_balance',    v_wallet.coin_balance
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_wallet(UUID, INT, INT) TO authenticated;

-- ── 7. admin_list_badge_definitions ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_badge_definitions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',              id,
        'badge_code',      badge_code,
        'display_name_en', display_name_en,
        'display_name_zh', display_name_zh,
        'icon',            icon,
        'category',        category::text
      )
      ORDER BY category, badge_code
    )
    FROM public.badge_definitions
    WHERE is_active = true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_badge_definitions() TO authenticated;

-- ── 8. admin_get_profile_badges ───────────────────────────────
-- Returns all badge_counters for a specific profile.
CREATE OR REPLACE FUNCTION public.admin_get_profile_badges(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'badge_code',      d.badge_code,
        'display_name_en', d.display_name_en,
        'icon',            d.icon,
        'category',        d.category::text,
        'count_available', COALESCE(c.count_available, 0),
        'count_lifetime',  COALESCE(c.count_lifetime, 0)
      )
      ORDER BY d.category, d.badge_code
    )
    FROM public.badge_definitions d
    LEFT JOIN public.profile_badge_counters c
      ON c.badge_id = d.id AND c.profile_id = p_profile_id
    WHERE d.is_active = true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_badges(UUID) TO authenticated;
