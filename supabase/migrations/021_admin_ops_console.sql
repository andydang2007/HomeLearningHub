-- 021: Admin ops console RPCs (dashboard stats, subscription, recycle bin, audit).

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.admin_audit_logs IS 'Internal audit trail for admin_* RPC actions.';

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._admin_audit(
  p_action TEXT,
  p_family_id UUID DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_audit_logs (admin_email, action, family_id, profile_id, details)
  VALUES (auth.email(), p_action, p_family_id, p_profile_id, COALESCE(p_details, '{}'::jsonb));
END;
$$;

-- ── Dashboard: plan quadrant counts ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_quadrants JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT jsonb_object_agg(
    account_type::text || '_' || plan_tier::text,
    cnt
  ) INTO v_quadrants
  FROM (
    SELECT account_type, plan_tier, COUNT(*)::INT AS cnt
    FROM public.families
    WHERE deleted_at IS NULL
    GROUP BY account_type, plan_tier
  ) q;

  RETURN jsonb_build_object(
    'total_families', (SELECT COUNT(*)::INT FROM public.families WHERE deleted_at IS NULL),
    'active_kid_profiles', (
      SELECT COUNT(*)::INT FROM public.profiles
      WHERE role = 'kid' AND deleted_at IS NULL
    ),
    'deleted_kid_profiles', (
      SELECT COUNT(*)::INT FROM public.profiles
      WHERE role = 'kid' AND deleted_at IS NOT NULL
    ),
    'quadrants', COALESCE(v_quadrants, '{}'::jsonb),
    'single_child_basic',   COALESCE((v_quadrants->>'single_child_basic')::INT, 0),
    'single_child_premium', COALESCE((v_quadrants->>'single_child_premium')::INT, 0),
    'multi_child_basic',    COALESCE((v_quadrants->>'multi_child_basic')::INT, 0),
    'multi_child_premium',  COALESCE((v_quadrants->>'multi_child_premium')::INT, 0)
  );
END;
$$;

-- ── Enhanced user lookup (includes premium expiry) ────────────────────────────
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
  v_ent      RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'error', 'user not found');
  END IF;

  SELECT * INTO v_family FROM public.families WHERE owner_user_id = v_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', true, 'user_id', v_user_id,
                              'email', lower(trim(p_email)), 'family_id', NULL);
  END IF;

  SELECT se.plan_tier, se.status, se.source, se.starts_at, se.ends_at
  INTO v_ent
  FROM public.subscription_entitlements se
  WHERE se.family_id = v_family.id
    AND se.status IN ('active', 'scheduled')
  ORDER BY se.ends_at DESC NULLS LAST
  LIMIT 1;

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
       LEFT JOIN public.profile_wallets w ON w.profile_id = p.id
       LEFT JOIN public.profile_badge_levels bl ON bl.profile_id = p.id
       LEFT JOIN (
         SELECT profile_id, SUM(count_available)::INT AS badge_total
         FROM public.profile_badge_counters
         GROUP BY profile_id
       ) bc ON bc.profile_id = p.id
       WHERE p.family_id = v_family.id
         AND p.role = 'kid'
         AND p.deleted_at IS NULL
       ORDER BY p.display_name
     ) sub
    );

  RETURN jsonb_build_object(
    'found',               true,
    'user_id',             v_user_id,
    'email',               lower(trim(p_email)),
    'family_id',           v_family.id,
    'account_type',        v_family.account_type::text,
    'plan_tier',           v_family.plan_tier::text,
    'entitlement_status',  v_ent.status::text,
    'entitlement_source',  v_ent.source::text,
    'premium_starts_at',   v_ent.starts_at,
    'premium_ends_at',     v_ent.ends_at,
    'profiles',            COALESCE(v_profiles, '[]'::jsonb)
  );
END;
$$;

-- ── Subscription update (plan + optional premium expiry) ─────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_family_subscription(
  p_family_id UUID,
  p_plan_tier public.plan_tier,
  p_account_type public.account_type,
  p_premium_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entitlement_id UUID;
  v_ends_at TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  IF p_family_id IS NULL THEN
    RAISE EXCEPTION 'family_id is required';
  END IF;

  UPDATE public.families
  SET plan_tier    = p_plan_tier,
      account_type = p_account_type,
      updated_at   = now()
  WHERE id = p_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  IF p_plan_tier = 'premium' THEN
    v_ends_at := COALESCE(p_premium_ends_at, now() + interval '90 days');

    SELECT id INTO v_entitlement_id
    FROM public.subscription_entitlements
    WHERE family_id = p_family_id
      AND status IN ('active', 'scheduled')
    ORDER BY ends_at DESC NULLS LAST
    LIMIT 1;

    IF v_entitlement_id IS NULL THEN
      INSERT INTO public.subscription_entitlements (
        family_id, account_type, plan_tier, source, status, starts_at, ends_at
      )
      VALUES (
        p_family_id, p_account_type, 'premium', 'manual', 'active', now(), v_ends_at
      )
      RETURNING id INTO v_entitlement_id;
    ELSE
      UPDATE public.subscription_entitlements
      SET plan_tier    = 'premium',
          account_type = p_account_type,
          ends_at      = v_ends_at,
          status       = 'active',
          updated_at   = now()
      WHERE id = v_entitlement_id;
    END IF;
  ELSE
    UPDATE public.subscription_entitlements
    SET plan_tier    = 'basic',
        account_type = p_account_type,
        updated_at   = now()
    WHERE family_id = p_family_id
      AND status IN ('active', 'scheduled');
  END IF;

  PERFORM public._admin_audit(
    'update_family_subscription',
    p_family_id,
    NULL,
    jsonb_build_object(
      'plan_tier', p_plan_tier::text,
      'account_type', p_account_type::text,
      'premium_ends_at', v_ends_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'family_id', p_family_id,
    'plan_tier', p_plan_tier::text,
    'account_type', p_account_type::text,
    'premium_ends_at', v_ends_at
  );
END;
$$;

-- ── Recycle bin: soft-deleted kid profiles ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_deleted_profiles(
  p_email TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY deleted_at DESC)
    FROM (
      SELECT jsonb_build_object(
        'profile_id',    p.id,
        'display_name',  p.display_name,
        'grade',         p.grade,
        'family_id',     p.family_id,
        'owner_email',   au.email,
        'deleted_at',    p.deleted_at,
        'badge_total',   COALESCE((
          SELECT SUM(count_available)::INT
          FROM public.profile_badge_counters c
          WHERE c.profile_id = p.id
        ), 0)
      ) AS row_data,
      p.deleted_at
      FROM public.profiles p
      JOIN public.families f ON f.id = p.family_id
      LEFT JOIN auth.users au ON au.id = f.owner_user_id
      WHERE p.role = 'kid'
        AND p.deleted_at IS NOT NULL
        AND (p_email IS NULL OR trim(p_email) = '' OR lower(au.email) = lower(trim(p_email)))
      ORDER BY p.deleted_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    ) sub
  ), '[]'::jsonb);
END;
$$;

-- ── Restore soft-deleted kid profile ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_restore_kid_profile(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE public.profiles
  SET deleted_at = NULL,
      updated_at = now()
  WHERE id = p_profile_id
    AND role = 'kid'
    AND deleted_at IS NOT NULL
  RETURNING family_id, display_name INTO v_family_id, v_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or not in recycle bin';
  END IF;

  PERFORM public._admin_audit(
    'restore_kid_profile',
    v_family_id,
    p_profile_id,
    jsonb_build_object('display_name', v_name)
  );

  RETURN jsonb_build_object('ok', true, 'profile_id', p_profile_id, 'display_name', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_family_subscription(UUID, public.plan_tier, public.account_type, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_deleted_profiles(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_kid_profile(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
