-- Administrator dodaje pozycję do planu Pralni tym samym pełnym formularzem,
-- którego używa kierowca. Jawna data prania ma pierwszeństwo przed datą
-- wyliczaną z przyjazdu i wyjazdu; NULL zachowuje dotychczasową regułę.

alter table public.entries
  add column if not exists laundry_planned_date date;

-- Usuwa pierwszy, uproszczony wariant RPC, jeśli zdążył trafić na środowisko.
drop function if exists public.admin_add_laundry_plan_entry(
  text, text, date, text, text, numeric, boolean
);

create or replace function public.admin_add_laundry_plan_entry(
  p_session_token text,
  p_id text,
  p_planned_date date,
  p_week_key text,
  p_client_name text,
  p_arr_day integer,
  p_pick_day integer,
  p_pick_week_key text,
  p_route_id integer,
  p_type text,
  p_weight numeric default null,
  p_trolleys integer default 1,
  p_urgent boolean default false,
  p_added_by text default null,
  p_arrival_trolley_nos text default null
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_result json;
begin
  perform public.require_admin(p_session_token);

  if p_planned_date is null then
    return json_build_object('error', 'Wybierz dzień prania');
  end if;
  if extract(isodow from p_planned_date)::integer = 7 then
    return json_build_object('error', 'Niedziela nie jest dniem operacyjnym pralni');
  end if;

  v_result := public.admin_insert_entry(
    p_session_token => p_session_token,
    p_id => p_id,
    p_week_key => p_week_key,
    p_client_name => p_client_name,
    p_arr_day => p_arr_day,
    p_pick_day => p_pick_day,
    p_pick_week_key => p_pick_week_key,
    p_route_id => p_route_id,
    p_type => p_type,
    p_weight => p_weight,
    p_trolleys => p_trolleys,
    p_urgent => p_urgent,
    p_added_by => p_added_by,
    p_arrival_trolley_nos => p_arrival_trolley_nos
  );

  if v_result->>'error' is not null then
    return v_result;
  end if;

  update public.entries
  set laundry_planned_date = p_planned_date,
      dirty_received_at = coalesce(dirty_received_at, now()),
      dirty_received_by = coalesce(dirty_received_by, p_added_by, 'Administrator')
  where id = p_id;

  return (v_result::jsonb || jsonb_build_object('planned_date', p_planned_date))::json;
end;
$$;

revoke all on function public.admin_add_laundry_plan_entry(
  text, text, date, text, text, integer, integer, text, integer, text,
  numeric, integer, boolean, text, text
) from public;
grant execute on function public.admin_add_laundry_plan_entry(
  text, text, date, text, text, integer, integer, text, integer, text,
  numeric, integer, boolean, text, text
) to anon, authenticated;
