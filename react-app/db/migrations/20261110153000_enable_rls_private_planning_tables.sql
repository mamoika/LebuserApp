begin;

-- Both tables are internal implementation details. The application reaches
-- them only through session-validating SECURITY DEFINER RPCs. No direct
-- PostgREST role needs row access, so RLS intentionally has no allow policy.
revoke all on table public.employee_month_roster_state
  from public, anon, authenticated;
revoke all on table public.driver_route_plan_assignments
  from public, anon, authenticated;

alter table public.employee_month_roster_state enable row level security;
alter table public.driver_route_plan_assignments enable row level security;

comment on table public.employee_month_roster_state is
  'Internal monthly roster state. Direct API access is denied; use validated roster RPCs.';
comment on table public.driver_route_plan_assignments is
  'Internal informational route plan. Direct API access is denied; use validated weekly plan RPCs.';

commit;
