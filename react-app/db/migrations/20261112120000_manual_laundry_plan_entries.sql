-- Administrator może dodać ręczną pozycję bezpośrednio do planu Pralni.
-- Jawna data ma pierwszeństwo przed datą wyliczaną z przyjazdu i wyjazdu,
-- ale nie zmienia zachowania istniejących wpisów (NULL = dotychczasowa reguła).

alter table public.entries
  add column if not exists laundry_planned_date date;

create or replace function public.admin_add_laundry_plan_entry(
  p_session_token text,
  p_id text,
  p_planned_date date,
  p_client_name text,
  p_type text,
  p_weight numeric default null,
  p_urgent boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_admin_name text;
  v_route_id integer;
  v_arr_day integer;
  v_pick_date date;
  v_pick_day integer;
  v_week_key text;
  v_pick_week_key text;
begin
  v_admin_id := public.require_admin(p_session_token);

  if nullif(trim(coalesce(p_id, '')), '') is null then
    return json_build_object('error', 'Brak id wpisu');
  end if;
  if p_planned_date is null then
    return json_build_object('error', 'Wybierz dzień prania');
  end if;
  if extract(isodow from p_planned_date)::integer = 7 then
    return json_build_object('error', 'Niedziela nie jest dniem operacyjnym pralni');
  end if;
  if p_weight is not null and p_weight < 0 then
    return json_build_object('error', 'Waga nie może być ujemna');
  end if;

  select name into v_admin_name
  from public.session_user(p_session_token)
  limit 1;
  select route_id into v_route_id
  from public.clients
  where name = nullif(trim(coalesce(p_client_name, '')), '')
    and archived_at is null
  limit 1;

  if v_route_id is null then
    return json_build_object('error', 'Nie znaleziono aktywnego klienta');
  end if;

  v_arr_day := extract(isodow from p_planned_date)::integer;
  v_pick_date := case
    when v_arr_day = 6 then p_planned_date + 2
    else p_planned_date + 1
  end;
  v_pick_day := extract(isodow from v_pick_date)::integer;
  v_week_key := to_char(date_trunc('week', p_planned_date)::date, 'YYYY-MM-DD');
  v_pick_week_key := to_char(date_trunc('week', v_pick_date)::date, 'YYYY-MM-DD');

  insert into public.entries (
    id,
    week_key,
    client_name,
    arr_day,
    pick_day,
    pick_week_key,
    route_id,
    type,
    weight,
    arrival_gross_kg,
    arrival_tare_kg,
    trolleys,
    urgent,
    added_by,
    laundry_planned_date,
    laundry_status
  ) values (
    p_id,
    v_week_key,
    trim(p_client_name),
    v_arr_day,
    v_pick_day,
    v_pick_week_key,
    v_route_id,
    coalesce(nullif(trim(coalesce(p_type, '')), ''), 'P'),
    p_weight,
    p_weight,
    0,
    0,
    coalesce(p_urgent, false),
    coalesce(nullif(trim(coalesce(v_admin_name, '')), ''), 'Administrator'),
    p_planned_date,
    'pending'
  );

  return json_build_object(
    'ok', true,
    'id', p_id,
    'planned_date', p_planned_date,
    'client_name', trim(p_client_name),
    'weight', p_weight
  );
end;
$$;

revoke all on function public.admin_add_laundry_plan_entry(text, text, date, text, text, numeric, boolean)
  from public;
grant execute on function public.admin_add_laundry_plan_entry(text, text, date, text, text, numeric, boolean)
  to anon, authenticated;
