begin;

-- Zakończenie i wznowienie pracy są osobnymi zdarzeniami. Bieżący znacznik
-- na employees steruje grafikiem, a ta tabela zachowuje pełną historię zmian.
create table if not exists public.employee_employment_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  event_type text not null check (event_type in ('employment_ended', 'employment_restarted')),
  effective_on date not null,
  recorded_at timestamptz not null default now(),
  constraint employee_employment_events_unique unique (employee_id, event_type, effective_on)
);

comment on table public.employee_employment_events is
  'Historia zakończeń i wznowień zatrudnienia bez usuwania danych z poprzednich miesięcy.';

create index if not exists employee_employment_events_employee_date_idx
  on public.employee_employment_events (employee_id, effective_on desc);

alter table public.employee_employment_events enable row level security;
revoke all on table public.employee_employment_events from public, anon, authenticated;

insert into public.employee_employment_events (employee_id, event_type, effective_on)
select e.id, 'employment_ended', e.employment_ended_on
from public.employees e
where e.employment_ended_on is not null
on conflict (employee_id, event_type, effective_on) do nothing;

create or replace function public.admin_end_employee_from_month(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end_date date;
begin
  perform public.require_admin(p_session_token);

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object('error', 'Nieprawidłowy miesiąc');
  end if;

  v_end_date := make_date(p_year, p_month, 1);

  update public.employees
  set active = false,
      employment_ended_on = case
        when employment_ended_on is null then v_end_date
        else least(employment_ended_on, v_end_date)
      end
  where id = p_employee_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  insert into public.employee_employment_events (employee_id, event_type, effective_on)
  values (p_employee_id, 'employment_ended', v_end_date)
  on conflict (employee_id, event_type, effective_on) do nothing;

  update public.employee_months
  set active = false,
      updated_at = now()
  where employee_id = p_employee_id
    and (
      year > p_year
      or (year = p_year and month >= p_month)
    );

  return json_build_object('ok', true, 'employment_ended_on', v_end_date);
end;
$$;

create or replace function public.admin_rehire_employee_from_month(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer,
  p_group_name text,
  p_default_start text default '7',
  p_default_end text default '15',
  p_sort_order integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restart_date date;
begin
  perform public.require_admin(p_session_token);

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object('error', 'Nieprawidłowy miesiąc');
  end if;

  v_restart_date := make_date(p_year, p_month, 1);

  update public.employees
  set active = true,
      employment_ended_on = null
  where id = p_employee_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  insert into public.employee_employment_events (employee_id, event_type, effective_on)
  values (p_employee_id, 'employment_restarted', v_restart_date)
  on conflict (employee_id, event_type, effective_on) do nothing;

  insert into public.employee_months (
    employee_id, year, month, active, group_name, sort_order, default_start, default_end
  ) values (
    p_employee_id,
    p_year,
    p_month,
    true,
    nullif(trim(coalesce(p_group_name, '')), ''),
    coalesce(p_sort_order, 0),
    coalesce(nullif(trim(coalesce(p_default_start, '')), ''), '7'),
    coalesce(nullif(trim(coalesce(p_default_end, '')), ''), '15')
  )
  on conflict (employee_id, year, month) do update set
    active = true,
    group_name = excluded.group_name,
    sort_order = excluded.sort_order,
    default_start = excluded.default_start,
    default_end = excluded.default_end,
    updated_at = now();

  insert into public.employee_month_roster_state (year, month, is_manual)
  values (p_year, p_month, true)
  on conflict (year, month)
  do update set is_manual = true;

  return json_build_object('ok', true, 'employment_restarted_on', v_restart_date);
end;
$$;

-- Karta kierowcy może być włączona tylko w miesiącu, w którym pracownik
-- należy do aktywnej grupy KIEROWCY.
create or replace function public.admin_save_driver_card_settings_for_month(
  p_session_token text,
  p_employee_id uuid,
  p_required boolean,
  p_last_downloaded_on date default null,
  p_year integer default null,
  p_month integer default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  perform public.require_admin(p_session_token);

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_last_downloaded_on is not null and p_last_downloaded_on > current_date then
    return json_build_object('error', 'Data odczytu karty nie może być z przyszłości');
  end if;
  if coalesce(p_required, false) and (
    p_year is null or p_month is null or p_month < 1 or p_month > 12
    or not exists (
      select 1
      from public.employee_months em
      where em.employee_id = p_employee_id
        and em.year = p_year
        and em.month = p_month
        and em.active = true
        and upper(trim(coalesce(em.group_name, ''))) = 'KIEROWCY'
    )
  ) then
    return json_build_object('error', 'Kartę kierowcy można włączyć tylko dla aktywnej osoby w grupie KIEROWCY');
  end if;

  update public.employees
  set driver_card_required = coalesce(p_required, false),
      driver_card_last_downloaded_on = p_last_downloaded_on
  where id = p_employee_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  if coalesce(p_required, false) and p_last_downloaded_on is not null then
    insert into public.driver_card_download_events (
      employee_id, downloaded_on, recorded_by, recorded_by_name
    ) values (
      p_employee_id, p_last_downloaded_on, v_user.id, v_user.name
    )
    on conflict (employee_id, downloaded_on) do nothing;
  end if;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.get_driver_card_reminders(p_session_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_cards json;
  v_history json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 1 then
    raise exception 'Work schedule access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(card) order by card.name), '[]'::json)
  into v_cards
  from (
    select
      e.id as employee_id,
      e.name,
      e.driver_card_last_downloaded_on as last_downloaded_on
    from public.employees e
    join public.employee_months em
      on em.employee_id = e.id
      and em.year = extract(year from current_date)::integer
      and em.month = extract(month from current_date)::integer
      and em.active = true
      and upper(trim(coalesce(em.group_name, ''))) = 'KIEROWCY'
    where e.driver_card_required = true
      and e.active = true
  ) card;

  select coalesce(json_agg(row_to_json(event_row) order by event_row.downloaded_on desc, event_row.recorded_at desc), '[]'::json)
  into v_history
  from (
    select
      h.id,
      h.employee_id,
      e.name,
      h.downloaded_on,
      h.recorded_by_name,
      h.recorded_at
    from public.driver_card_download_events h
    join public.employees e on e.id = h.employee_id
    order by h.downloaded_on desc, h.recorded_at desc
    limit 250
  ) event_row;

  return json_build_object('ok', true, 'cards', v_cards, 'history', v_history);
end;
$$;

create or replace function public.mark_driver_card_downloaded(
  p_session_token text,
  p_employee_id uuid,
  p_downloaded_on date default current_date
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_downloaded_on date := coalesce(p_downloaded_on, current_date);
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;
  if v_downloaded_on > current_date then
    return json_build_object('error', 'Data odczytu karty nie może być z przyszłości');
  end if;

  if not exists (
    select 1
    from public.employees e
    join public.employee_months em
      on em.employee_id = e.id
      and em.year = extract(year from v_downloaded_on)::integer
      and em.month = extract(month from v_downloaded_on)::integer
      and em.active = true
      and upper(trim(coalesce(em.group_name, ''))) = 'KIEROWCY'
    where e.id = p_employee_id
      and e.driver_card_required = true
      and e.active = true
  ) then
    return json_build_object('error', 'Nie znaleziono aktywnej karty kierowcy w grupie KIEROWCY');
  end if;

  insert into public.driver_card_download_events (
    employee_id, downloaded_on, recorded_by, recorded_by_name
  ) values (
    p_employee_id, v_downloaded_on, v_user.id, v_user.name
  )
  on conflict (employee_id, downloaded_on) do nothing;

  update public.employees
  set driver_card_last_downloaded_on = greatest(
    coalesce(driver_card_last_downloaded_on, v_downloaded_on),
    v_downloaded_on
  )
  where id = p_employee_id;

  return json_build_object('ok', true, 'downloaded_on', v_downloaded_on);
end;
$$;

revoke all on function public.admin_rehire_employee_from_month(text, uuid, integer, integer, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_rehire_employee_from_month(text, uuid, integer, integer, text, text, text, integer) to anon, authenticated;

revoke all on function public.admin_save_driver_card_settings_for_month(text, uuid, boolean, date, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_save_driver_card_settings_for_month(text, uuid, boolean, date, integer, integer) to anon, authenticated;

revoke all on function public.get_driver_card_reminders(text) from public, anon, authenticated;
grant execute on function public.get_driver_card_reminders(text) to anon, authenticated;

revoke all on function public.mark_driver_card_downloaded(text, uuid, date) from public, anon, authenticated;
grant execute on function public.mark_driver_card_downloaded(text, uuid, date) to anon, authenticated;

commit;
