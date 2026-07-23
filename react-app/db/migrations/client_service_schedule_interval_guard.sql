-- Konstruktor obsługuje uzgodnione częstotliwości: co tydzień lub co 2 tygodnie.

begin;

alter table public.route_service_rules
  drop constraint if exists route_service_rules_interval_weeks_check;
alter table public.route_service_rules
  add constraint route_service_rules_interval_weeks_check
  check (interval_weeks between 1 and 2);

alter table public.client_service_rules
  drop constraint if exists client_service_rules_interval_weeks_check;
alter table public.client_service_rules
  add constraint client_service_rules_interval_weeks_check
  check (interval_weeks between 1 and 2);

create or replace function private.insert_service_rules(
  p_owner_kind text,
  p_owner_id text,
  p_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rule jsonb;
  v_weekday integer;
  v_interval integer;
  v_anchor date;
begin
  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' then
    raise exception 'Reguły planu muszą być listą' using errcode = '22023';
  end if;

  for v_rule in
    select value from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
  loop
    v_weekday := nullif(v_rule->>'weekday', '')::integer;
    v_interval := coalesce(nullif(v_rule->>'interval_weeks', '')::integer, 1);
    v_anchor := date_trunc(
      'week',
      coalesce(nullif(v_rule->>'anchor_week', '')::date, current_date)
    )::date;

    if v_weekday not between 1 and 5 or v_interval not between 1 and 2 then
      raise exception 'Nieprawidłowa reguła planu obsługi' using errcode = '22023';
    end if;

    if p_owner_kind = 'route' then
      insert into public.route_service_rules (
        route_id, weekday, interval_weeks, anchor_week
      )
      values (p_owner_id::integer, v_weekday, v_interval, v_anchor);
    elsif p_owner_kind = 'client' then
      insert into public.client_service_rules (
        client_id, weekday, interval_weeks, anchor_week
      )
      values (p_owner_id::uuid, v_weekday, v_interval, v_anchor);
    else
      raise exception 'Nieprawidłowy właściciel planu obsługi'
        using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke execute on function private.insert_service_rules(
  text, text, jsonb
) from public, anon, authenticated;

commit;
