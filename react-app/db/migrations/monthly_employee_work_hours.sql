-- Miesięczne godziny domyślnej zmiany pracownika.
-- Zmiana godzin w jednym miesiącu nie może przeliczać historycznych wpisów
-- typu "8", które korzystają z domyślnego startu pracownika.

alter table public.employee_months
  add column if not exists default_start text,
  add column if not exists default_end text;

-- Każda ścieżka zapisu (również starsze RPC, które nie podają godzin)
-- dziedziczy je z ostatniego wcześniejszego miesiąca. Dzięki temu nie ma
-- ukrytego fallbacku 7–15 zależnego od tego, które RPC utworzyło wiersz.
create or replace function private.employee_month_inherit_hours()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_previous_start text;
  v_previous_end text;
  v_global_start text;
  v_global_end text;
begin
  if nullif(trim(new.default_start), '') is not null
     and nullif(trim(new.default_end), '') is not null then
    return new;
  end if;

  select em.default_start, em.default_end
  into v_previous_start, v_previous_end
  from public.employee_months em
  where em.employee_id = new.employee_id
    and (em.year < new.year or (em.year = new.year and em.month < new.month))
  order by em.year desc, em.month desc
  limit 1;

  select e.default_start, e.default_end
  into v_global_start, v_global_end
  from public.employees e
  where e.id = new.employee_id;

  new.default_start := coalesce(
    nullif(trim(new.default_start), ''),
    nullif(trim(v_previous_start), ''),
    nullif(trim(v_global_start), ''),
    '7'
  );
  new.default_end := coalesce(
    nullif(trim(new.default_end), ''),
    nullif(trim(v_previous_end), ''),
    nullif(trim(v_global_end), ''),
    '15'
  );
  return new;
end;
$$;

drop trigger if exists employee_month_inherit_hours on public.employee_months;
create trigger employee_month_inherit_hours
before insert on public.employee_months
for each row execute function private.employee_month_inherit_hours();

-- Istniejące snapshoty zachowują godziny obowiązujące przed tą migracją.
update public.employee_months em
set default_start = coalesce(nullif(trim(em.default_start), ''), nullif(trim(e.default_start), ''), '7'),
    default_end = coalesce(nullif(trim(em.default_end), ''), nullif(trim(e.default_end), ''), '15')
from public.employees e
where e.id = em.employee_id
  and (
    nullif(trim(em.default_start), '') is null
    or nullif(trim(em.default_end), '') is null
  );

alter table public.employee_months
  alter column default_start drop default,
  alter column default_start set not null,
  alter column default_end drop default,
  alter column default_end set not null;

comment on column public.employee_months.default_start is
  'Domyślna godzina rozpoczęcia zmiany obowiązująca wyłącznie w tym miesiącu.';
comment on column public.employee_months.default_end is
  'Domyślna godzina zakończenia zmiany obowiązująca wyłącznie w tym miesiącu.';

-- Znacznik odróżnia miesiąc świadomie zainicjalizowany (z którego wolno potem
-- usuwać osoby) od miesiąca częściowego, w którym pojedynczy wiersz utworzyło
-- inne RPC. Bez niego pierwszy insert blokował skopiowanie reszty rosteru.
create table if not exists public.employee_month_roster_state (
  year integer not null,
  month integer not null check (month between 1 and 12),
  initialized_at timestamptz not null default now(),
  primary key (year, month)
);

insert into public.employee_month_roster_state (year, month)
select distinct em.year, em.month
from public.employee_months em
on conflict (year, month) do nothing;

revoke all on table public.employee_month_roster_state from public, anon, authenticated;
revoke execute on function private.employee_month_inherit_hours() from public, anon, authenticated;

create or replace function public.get_month_roster(
  p_year integer,
  p_month integer,
  p_include_inactive boolean default false
)
returns table(
  id uuid,
  name text,
  default_start text,
  default_end text,
  contract_type text,
  group_name text,
  sort_order integer,
  active boolean,
  _ym_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_year integer;
  v_prev_month integer;
begin
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Invalid month' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('employee_month_roster'), p_year * 100 + p_month);

  if not exists (
    select 1 from public.employee_month_roster_state state
    where state.year = p_year and state.month = p_month
  ) then
    -- Dziedziczymy wyłącznie z miesiąca oznaczonego jako kompletnie
    -- zainicjalizowany. Pojedynczy wiersz utworzony przez inne RPC nie może
    -- zostać źródłem całego kolejnego rosteru.
    select state.year, state.month
    into v_prev_year, v_prev_month
    from public.employee_month_roster_state state
    where state.year < p_year
       or (state.year = p_year and state.month < p_month)
    order by state.year desc, state.month desc
    limit 1;

    if v_prev_year is not null then
      insert into public.employee_months (
        employee_id, year, month, active, group_name, sort_order, default_start, default_end
      )
      select
        em.employee_id, p_year, p_month, true, em.group_name, em.sort_order,
        em.default_start, em.default_end
      from public.employee_months em
      where em.year = v_prev_year
        and em.month = v_prev_month
        and em.active = true
      on conflict (employee_id, year, month) do nothing;
    else
      insert into public.employee_months (
        employee_id, year, month, active, group_name, sort_order, default_start, default_end
      )
      select
        e.id, p_year, p_month, true, e.group_name, e.sort_order,
        coalesce(nullif(trim(e.default_start), ''), '7'),
        coalesce(nullif(trim(e.default_end), ''), '15')
      from public.employees e
      where e.active = true
      on conflict (employee_id, year, month) do nothing;
    end if;

    insert into public.employee_month_roster_state (year, month)
    values (p_year, p_month)
    on conflict (year, month) do nothing;
  end if;

  return query
  select
    e.id,
    e.name,
    coalesce(nullif(trim(em.default_start), ''), nullif(trim(e.default_start), ''), '7') as default_start,
    coalesce(nullif(trim(em.default_end), ''), nullif(trim(e.default_end), ''), '15') as default_end,
    e.contract_type,
    coalesce(em.group_name, e.group_name) as group_name,
    coalesce(em.sort_order, e.sort_order, 0) as sort_order,
    em.active,
    em.id as _ym_id
  from public.employee_months em
  join public.employees e on e.id = em.employee_id
  where em.year = p_year
    and em.month = p_month
    and (p_include_inactive or em.active = true)
  order by coalesce(em.sort_order, e.sort_order, 0), e.name;
end;
$$;

create or replace function public.admin_save_employee(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer,
  p_name text,
  p_group_name text,
  p_contract_type text default 'UoP',
  p_default_start text default '7',
  p_default_end text default '15',
  p_active boolean default true,
  p_sort_order integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_name text;
  v_default_start text;
  v_default_end text;
begin
  perform public.require_admin(p_session_token);

  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_default_start := coalesce(nullif(trim(coalesce(p_default_start, '')), ''), '7');
  v_default_end := coalesce(nullif(trim(coalesce(p_default_end, '')), ''), '15');

  if v_name is null then
    return json_build_object('error', 'Nazwisko i imię jest wymagane');
  end if;

  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object('error', 'Nieprawidłowy miesiąc');
  end if;

  if p_employee_id is null then
    insert into public.employees (
      name, group_name, contract_type, default_start, default_end, active, sort_order
    )
    values (
      v_name,
      nullif(trim(coalesce(p_group_name, '')), ''),
      coalesce(nullif(trim(coalesce(p_contract_type, '')), ''), 'UoP'),
      v_default_start,
      v_default_end,
      true,
      coalesce(p_sort_order, 0)
    )
    returning id into v_employee_id;
  else
    -- Dane osobowe są globalne, ale godziny pozostają wyłącznie w snapshotcie miesiąca.
    update public.employees
    set name = v_name,
        contract_type = coalesce(nullif(trim(coalesce(p_contract_type, '')), ''), 'UoP')
    where id = p_employee_id
    returning id into v_employee_id;

    if v_employee_id is null then
      return json_build_object('error', 'Nie znaleziono pracownika');
    end if;
  end if;

  insert into public.employee_months (
    employee_id, year, month, active, group_name, sort_order, default_start, default_end
  )
  values (
    v_employee_id,
    p_year,
    p_month,
    coalesce(p_active, true),
    nullif(trim(coalesce(p_group_name, '')), ''),
    coalesce(p_sort_order, 0),
    v_default_start,
    v_default_end
  )
  on conflict (employee_id, year, month)
  do update set
    active = excluded.active,
    group_name = excluded.group_name,
    sort_order = excluded.sort_order,
    default_start = excluded.default_start,
    default_end = excluded.default_end,
    updated_at = now();

  return json_build_object('ok', true, 'id', v_employee_id);
end;
$$;

create or replace function public.admin_add_employee_to_month(
  p_session_token text,
  p_employee_id uuid,
  p_year integer,
  p_month integer,
  p_group_name text,
  p_sort_order integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_start text;
  v_default_end text;
begin
  perform public.require_admin(p_session_token);

  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object('error', 'Nieprawidłowy miesiąc');
  end if;

  select
    coalesce(nullif(trim(previous.default_start), ''), nullif(trim(e.default_start), ''), '7'),
    coalesce(nullif(trim(previous.default_end), ''), nullif(trim(e.default_end), ''), '15')
  into v_default_start, v_default_end
  from public.employees e
  left join lateral (
    select em.default_start, em.default_end
    from public.employee_months em
    where em.employee_id = e.id
      and (em.year < p_year or (em.year = p_year and em.month < p_month))
    order by em.year desc, em.month desc
    limit 1
  ) previous on true
  where e.id = p_employee_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  insert into public.employee_months (
    employee_id, year, month, active, group_name, sort_order, default_start, default_end
  )
  values (
    p_employee_id,
    p_year,
    p_month,
    true,
    nullif(trim(coalesce(p_group_name, '')), ''),
    coalesce(p_sort_order, 0),
    v_default_start,
    v_default_end
  )
  on conflict (employee_id, year, month)
  do update set
    active = true,
    group_name = excluded.group_name,
    sort_order = excluded.sort_order,
    default_start = excluded.default_start,
    default_end = excluded.default_end,
    updated_at = now();

  return json_build_object('ok', true);
end;
$$;

-- Panel kierowcy musi używać godzin miesiąca kursu, a nie bieżącej wartości globalnej.
create or replace function public.get_my_work_time(
  p_session_token text,
  p_year integer,
  p_month integer
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_employee json;
  v_reports json;
  v_schedule json;
  v_events json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Invalid month' using errcode = '22023';
  end if;

  select row_to_json(x) into v_employee
  from (
    select mr.id, mr.name, mr.default_start, mr.default_end, mr.contract_type, mr.group_name
    from public.users u
    join public.get_month_roster(p_year, p_month, true) mr on mr.id = u.employee_id
    where u.id = v_user.id
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.work_date desc), '[]'::json)
  into v_reports
  from (
    select r.*
    from public.work_time_reports r
    where r.user_id = v_user.id
      and extract(year from r.work_date)::integer = p_year
      and extract(month from r.work_date)::integer = p_month
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.day), '[]'::json)
  into v_schedule
  from (
    select s.day, s.value
    from public.schedule_entries s
    join public.users u on u.employee_id = s.employee_id
    where u.id = v_user.id
      and s.year = p_year
      and s.month = p_month
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
  into v_events
  from (
    select ev.*
    from public.work_time_report_events ev
    join public.work_time_reports r on r.id = ev.report_id
    where r.user_id = v_user.id
      and extract(year from r.work_date)::integer = p_year
      and extract(month from r.work_date)::integer = p_month
  ) x;

  return json_build_object(
    'ok', true,
    'employee', v_employee,
    'reports', v_reports,
    'schedule_entries', v_schedule,
    'events', v_events
  );
end;
$$;

revoke execute on function public.get_month_roster(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_save_employee(text, uuid, integer, integer, text, text, text, text, text, boolean, integer) to anon, authenticated;
grant execute on function public.admin_add_employee_to_month(text, uuid, integer, integer, text, integer) to anon, authenticated;
grant execute on function public.get_my_work_time(text, integer, integer) to anon, authenticated;
