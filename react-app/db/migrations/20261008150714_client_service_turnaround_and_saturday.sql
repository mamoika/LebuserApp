-- Sobotnie trasy oraz jawne mapowanie: przyjazd brudnego -> wyjazd czystego.

begin;

alter table public.clients
  add column if not exists service_turnaround_days jsonb not null default '{}'::jsonb;

alter table public.clients
  drop constraint if exists clients_service_turnaround_days_check;
alter table public.clients
  add constraint clients_service_turnaround_days_check
  check (jsonb_typeof(service_turnaround_days) = 'object');

alter table public.route_service_rules
  drop constraint if exists route_service_rules_weekday_check;
alter table public.route_service_rules
  add constraint route_service_rules_weekday_check
  check (weekday between 1 and 6);

alter table public.client_service_rules
  drop constraint if exists client_service_rules_weekday_check;
alter table public.client_service_rules
  add constraint client_service_rules_weekday_check
  check (weekday between 1 and 6);

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
  v_turnaround integer;
  v_turnarounds jsonb := '{}'::jsonb;
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

    if v_weekday not between 1 and 6 or v_interval not between 1 and 2 then
      raise exception 'Nieprawidłowa reguła planu obsługi' using errcode = '22023';
    end if;

    if p_owner_kind = 'route' then
      insert into public.route_service_rules (
        route_id, weekday, interval_weeks, anchor_week
      ) values (p_owner_id::integer, v_weekday, v_interval, v_anchor);
    elsif p_owner_kind = 'client' then
      v_turnaround := nullif(v_rule->>'turnaround_days', '')::integer;
      if v_turnaround is not null and v_turnaround not between 1 and 13 then
        raise exception 'Termin wyjazdu musi wypadać 1-13 dni po przyjeździe'
          using errcode = '22023';
      end if;
      if v_turnaround is not null then
        v_turnarounds := jsonb_set(
          v_turnarounds,
          array[v_weekday::text],
          to_jsonb(v_turnaround),
          true
        );
      end if;
      insert into public.client_service_rules (
        client_id, weekday, interval_weeks, anchor_week
      ) values (p_owner_id::uuid, v_weekday, v_interval, v_anchor);
    else
      raise exception 'Nieprawidłowy właściciel planu obsługi'
        using errcode = '22023';
    end if;
  end loop;

  if p_owner_kind = 'client' then
    update public.clients
    set service_turnaround_days = v_turnarounds
    where id = p_owner_id::uuid;
  end if;
end;
$$;

revoke execute on function private.insert_service_rules(text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.admin_save_client_service_rules(
  p_session_token text,
  p_client_id uuid,
  p_mode text,
  p_rules jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_mode text := lower(trim(coalesce(p_mode, 'inherit')));
  v_trip record;
begin
  perform private.require_clients_routes_editor(p_session_token);
  if v_mode not in ('inherit', 'custom', 'disabled') then
    return json_build_object('error', 'Nieprawidłowy tryb planu klienta');
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;
  if v_mode = 'custom'
     and jsonb_array_length(coalesce(p_rules, '[]'::jsonb)) = 0 then
    return json_build_object('error', 'Własny plan klienta wymaga co najmniej jednego dnia');
  end if;

  update public.clients
  set service_schedule_mode = v_mode,
      service_turnaround_days = '{}'::jsonb
  where id = p_client_id;

  delete from public.client_service_rules where client_id = p_client_id;
  if v_mode = 'custom' then
    perform private.insert_service_rules('client', p_client_id::text, p_rules);
  end if;

  for v_trip in
    select id from public.driver_trips
    where status in ('planned', 'active', 'handover')
      and trip_date >= (now() at time zone 'Europe/Warsaw')::date
  loop
    perform private.sync_trip_course(v_trip.id);
  end loop;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_save_client_service_rules(text, uuid, text, jsonb)
  from public;
grant execute on function public.admin_save_client_service_rules(text, uuid, text, jsonb)
  to anon, authenticated;

create or replace function private.client_service_is_due(
  p_client_id uuid,
  p_service_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_client public.clients;
  v_route public.routes;
begin
  select * into v_client from public.clients where id = p_client_id;
  if v_client.id is null
     or v_client.archived_at is not null
     or v_client.service_schedule_mode = 'disabled' then
    return false;
  end if;

  if v_client.service_schedule_mode = 'custom' then
    return exists (
      select 1
      from public.client_service_rules rule
      where rule.client_id = v_client.id
        and (
          private.service_rule_is_due(
            rule.weekday, rule.interval_weeks, rule.anchor_week, p_service_date
          )
          or (
            coalesce(v_client.service_turnaround_days ->> rule.weekday::text, '') ~ '^[0-9]+$'
            and private.service_rule_is_due(
              rule.weekday,
              rule.interval_weeks,
              rule.anchor_week,
              p_service_date - (v_client.service_turnaround_days ->> rule.weekday::text)::integer
            )
          )
        )
    );
  end if;

  if exists (
    select 1 from public.route_service_rules where route_id = v_client.route_id
  ) then
    return exists (
      select 1
      from public.route_service_rules rule
      where rule.route_id = v_client.route_id
        and private.service_rule_is_due(
          rule.weekday, rule.interval_weeks, rule.anchor_week, p_service_date
        )
    );
  end if;

  select * into v_route from public.routes where id = v_client.route_id;
  return case coalesce(v_route.schedule, 'other')
    when 'daily' then extract(isodow from p_service_date)::integer between 1 and 5
    when 'mwf' then extract(isodow from p_service_date)::integer in (1, 3, 5)
    when 'tth' then extract(isodow from p_service_date)::integer in (2, 4)
    else false
  end;
end;
$$;

revoke execute on function private.client_service_is_due(uuid, date)
  from public, anon, authenticated;

-- Uzgodnione plany startowe. Każda zmiana przechodzi przez istniejące triggery audytu.
with configured(name, turnarounds, weekdays) as (
  values
    ('Radisson', '{"1":2,"2":2,"4":4,"5":4}'::jsonb, array[1,2,4,5]::integer[]),
    ('Motel One', '{"1":2,"2":2,"4":2,"5":4,"6":2}'::jsonb, array[1,2,4,5,6]::integer[])
)
update public.clients client
set service_schedule_mode = 'custom',
    service_turnaround_days = configured.turnarounds
from configured
where lower(trim(client.name)) = lower(configured.name);

delete from public.client_service_rules rule
using public.clients client
where rule.client_id = client.id
  and lower(trim(client.name)) in ('radisson', 'motel one');

insert into public.client_service_rules (client_id, weekday, interval_weeks, anchor_week)
select client.id, day.weekday::smallint, 1, date '2026-10-05'
from public.clients client
cross join lateral unnest(
  case lower(trim(client.name))
    when 'radisson' then array[1,2,4,5]
    when 'motel one' then array[1,2,4,5,6]
  end
) as day(weekday)
where lower(trim(client.name)) in ('radisson', 'motel one');

commit;
