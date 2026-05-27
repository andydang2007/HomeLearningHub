-- 016: Admin/ops view for family ↔ email ↔ premium expiry; service-role RPC to adjust ends_at.

BEGIN;

CREATE OR REPLACE VIEW public.family_billing_overview_v AS
SELECT
  f.id AS family_id,
  f.owner_user_id,
  au.email AS owner_email,
  f.account_type,
  f.plan_tier AS family_plan_tier,
  se.id AS entitlement_id,
  se.plan_tier AS entitlement_plan_tier,
  se.status AS entitlement_status,
  se.source AS entitlement_source,
  se.starts_at AS premium_starts_at,
  se.ends_at AS premium_ends_at,
  pc.change_kind AS pending_change_kind,
  pc.effective_at AS pending_effective_at,
  f.created_at AS family_created_at
FROM public.families f
LEFT JOIN auth.users au ON au.id = f.owner_user_id
LEFT JOIN LATERAL (
  SELECT id, plan_tier, status, source, starts_at, ends_at
  FROM public.subscription_entitlements
  WHERE family_id = f.id
    AND status IN ('active', 'scheduled')
  ORDER BY ends_at DESC NULLS LAST
  LIMIT 1
) se ON true
LEFT JOIN public.subscription_pending_changes pc ON pc.family_id = f.id
WHERE f.deleted_at IS NULL;

COMMENT ON VIEW public.family_billing_overview_v IS
  'Ops: owner email, plan, premium_ends_at. Use admin_set_premium_ends_at or edit subscription_entitlements.';

REVOKE ALL ON public.family_billing_overview_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.family_billing_overview_v TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_premium_ends_at(
  p_family_id UUID,
  p_ends_at TIMESTAMPTZ,
  p_plan_tier public.plan_tier DEFAULT 'premium'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '');
  v_entitlement_id UUID;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: service_role only';
  END IF;

  IF p_family_id IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'family_id and ends_at are required';
  END IF;

  SELECT id INTO v_entitlement_id
  FROM public.subscription_entitlements
  WHERE family_id = p_family_id
    AND status IN ('active', 'scheduled')
  ORDER BY ends_at DESC NULLS LAST
  LIMIT 1;

  IF v_entitlement_id IS NULL THEN
    INSERT INTO public.subscription_entitlements (
      family_id,
      account_type,
      plan_tier,
      source,
      status,
      starts_at,
      ends_at
    )
    SELECT
      f.id,
      f.account_type,
      COALESCE(p_plan_tier, 'premium'),
      'manual',
      'active',
      now(),
      p_ends_at
    FROM public.families f
    WHERE f.id = p_family_id
    RETURNING id INTO v_entitlement_id;
  ELSE
    UPDATE public.subscription_entitlements
    SET plan_tier = COALESCE(p_plan_tier, plan_tier),
        ends_at = p_ends_at,
        status = 'active',
        source = CASE WHEN source = 'trial' THEN source ELSE 'manual' END,
        updated_at = now()
    WHERE id = v_entitlement_id;
  END IF;

  UPDATE public.families
  SET plan_tier = COALESCE(p_plan_tier, 'premium'),
      updated_at = now()
  WHERE id = p_family_id;

  RETURN v_entitlement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_premium_ends_at(UUID, TIMESTAMPTZ, public.plan_tier) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_premium_ends_at(UUID, TIMESTAMPTZ, public.plan_tier) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
