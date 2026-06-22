-- ============================================================
--  Driver trip labels for ScheduleView through a session-token RPC.
--
--  ScheduleView uses these rows only to show assignment labels such as
--  "Przywiezie / Wiezie / Przywiózł". This migration moves that read out of
--  direct browser table SELECTs without changing the visible schedule logic.
-- ============================================================

create or replace function public.get_schedule_driver_trips(
  p_session_token text,
  p_limit integer default 120
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_limit integer := least(greatest(coalesce(p_limit, 120), 1), 300);
  v_rows json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_rows
  from (
    select *
    from public.driver_trips
    order by started_at desc
    limit v_limit
  ) x;

  return json_build_object('ok', true, 'trips', v_rows);
end;
$$;

grant execute on function public.get_schedule_driver_trips(text, integer) to anon, authenticated;
