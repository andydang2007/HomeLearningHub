-- Restore get_family_info without shield side-effects (fixes read-only transaction error
-- if 023 was applied with a STABLE/volatile version that called ensure_* on read).

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

GRANT EXECUTE ON FUNCTION public.get_family_info() TO authenticated;
