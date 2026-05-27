-- 015: Subscription changes effective at end of billing cycle + dashboard RPCs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL UNIQUE REFERENCES public.families(id) ON DELETE CASCADE,
  change_kind TEXT NOT NULL CHECK (change_kind IN ('cancel', 'downgrade', 'upgrade', 'account_change')),
  target_account_type public.account_type,
  target_plan_tier public.plan_tier NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_pending_changes IS
  'Scheduled subscription/account changes; applied at effective_at (end of billing cycle).';

CREATE TRIGGER trg_subscription_pending_changes_updated_at
  BEFORE UPDATE ON public.subscription_pending_changes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscription_pending_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY family_select_subscription_pending_changes ON public.subscription_pending_changes
  FOR SELECT USING (family_id = public.current_family_id());

-- Writes only via SECURITY DEFINER RPCs.

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

CREATE OR REPLACE FUNCTION public.schedule_subscription_change(
  p_target_account_type public.account_type DEFAULT NULL,
  p_target_plan_tier public.plan_tier DEFAULT NULL,
  p_change_kind TEXT DEFAULT 'account_change'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_current_account public.account_type;
  v_current_plan public.plan_tier;
  v_ends_at TIMESTAMPTZ;
  v_kid_count INT;
  v_effective_at TIMESTAMPTZ;
  v_kind TEXT := lower(trim(COALESCE(p_change_kind, 'account_change')));
  v_target_account public.account_type;
  v_target_plan public.plan_tier;
BEGIN
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  SELECT account_type, plan_tier INTO v_current_account, v_current_plan
  FROM public.families
  WHERE id = v_family_id;

  SELECT ends_at INTO v_ends_at
  FROM public.subscription_entitlements
  WHERE family_id = v_family_id
    AND status IN ('active', 'scheduled')
    AND (ends_at IS NULL OR ends_at > now())
  ORDER BY ends_at DESC NULLS LAST
  LIMIT 1;

  v_effective_at := COALESCE(v_ends_at, now() + interval '30 days');
  v_target_account := COALESCE(p_target_account_type, v_current_account);
  v_target_plan := COALESCE(p_target_plan_tier, v_current_plan);

  -- Billing/refund policy: block self-service Family → Individual downgrade.
  IF v_current_account = 'multi_child' AND v_target_account = 'single_child' THEN
    RAISE EXCEPTION 'Family Account cannot be downgraded to Individual Account via self-service';
  END IF;

  IF v_kind = 'cancel' THEN
    v_target_plan := 'basic';
    v_target_account := v_current_account;
  ELSIF v_kind NOT IN ('downgrade', 'upgrade', 'account_change') THEN
    RAISE EXCEPTION 'Invalid change kind';
  END IF;

  IF v_target_account = 'single_child' THEN
    SELECT COUNT(*) INTO v_kid_count
    FROM public.profiles
    WHERE family_id = v_family_id AND role = 'kid' AND deleted_at IS NULL;
    IF v_kid_count > 1 THEN
      RAISE EXCEPTION 'Cannot switch to Individual Account while more than one child profile exists';
    END IF;
  END IF;

  INSERT INTO public.subscription_pending_changes (
    family_id, change_kind, target_account_type, target_plan_tier, effective_at
  )
  VALUES (
    v_family_id, v_kind, v_target_account, v_target_plan, v_effective_at
  )
  ON CONFLICT (family_id) DO UPDATE
  SET change_kind = EXCLUDED.change_kind,
      target_account_type = EXCLUDED.target_account_type,
      target_plan_tier = EXCLUDED.target_plan_tier,
      effective_at = EXCLUDED.effective_at,
      updated_at = now();

  RETURN json_build_object(
    'effective_at', v_effective_at,
    'change_kind', v_kind,
    'target_plan_tier', v_target_plan,
    'target_account_type', v_target_account
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_subscription()
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

  DELETE FROM public.subscription_pending_changes
  WHERE family_id = v_family_id
    AND change_kind = 'cancel';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_family_info() TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_subscription_change(public.account_type, public.plan_tier, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_subscription() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
