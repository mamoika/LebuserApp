begin;

-- A monthly roster is either an automatic continuation of the previous month
-- or a manually prepared snapshot. Automatic future months stay in sync until
-- somebody deliberately edits their roster or daily schedule.
alter table public.employees
  add column if not exists employment_ended_on date;

comment on column public.employees.employment_ended_on is
  'First month in which the employee must no longer appear in the work roster.';

alter table public.employee_month_roster_state
  add column if not exists is_manual boolean not null default true,
  add column if not exists source_year integer,
  add column if not exists source_month integer,
  add column if not exists refreshed_at timestamptz;

-- Existing untouched future snapshots were created only by opening the month.
-- They can safely return to automatic inheritance. A schedule entry or a later
-- roster edit means the month was intentionally prepared and must be preserved.
update public.employee_month_roster_state state
set is_manual = false
where make_date(state.year, state.month, 1) > date_trunc('month', current_date)::date
  and not exists (
    select 1
    from public.schedule_entries schedule
    where schedule.year = state.year
      and schedule.month = state.month
  )
  and not exists (
    select 1
    from public.employee_months em
    where em.year = state.year
      and em.month = state.month
      and em.updated_at > state.initialized_at + interval '1 second'
  );

create or replace function private.mark_future_roster_manual()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_year integer;
  v_month integer;
begin
  if tg_op = 'DELETE' then
    v_year := old.year;
    v_month := old.month;
  else
    v_year := new.year;
    v_month := new.month;
  end if;

  if make_date(v_year, v_month, 1) > date_trunc('month', current_date)::date then
    insert into public.employee_month_roster_state (year, month, is_manual)
    values (v_year, v_month, true)
    on conflict (year, month)
    do update set is_manual = true;
  end if;

  return null;
end;
$$;

drop trigger if exists schedule_entry_marks_roster_manual on public.schedule_entries;
create trigger schedule_entry_marks_roster_manual
after insert or update or delete on public.schedule_entries
for each row execute function private.mark_future_roster_manual();

revoke execute on function private.mark_future_roster_manual() from public, anon, authenticated;

create or replace function private.mark_employee_roster_manual()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_year integer;
  v_month integer;
begin
  if current_setting('lebuser.auto_roster_refresh', true) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_year := old.year;
    v_month := old.month;
  else
    v_year := new.year;
    v_month := new.month;
  end if;

  insert into public.employee_month_roster_state (year, month, is_manual)
  values (v_year, v_month, true)
  on conflict (year, month)
  do update set is_manual = true;

  return null;
end;
$$;

revoke execute on function private.mark_employee_roster_manual() from public, anon, authenticated;

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
  v_target_date date;
  v_previous_date date;
  v_state_exists boolean;
  v_is_manual boolean;
  v_should_refresh boolean;
begin
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Invalid month' using errcode = '22023';
  end if;

  v_target_date := make_date(p_year, p_month, 1);
  v_previous_date := (make_date(p_year, p_month, 1) - interval '1 month')::date;

  perform pg_advisory_xact_lock(hashtext('employee_month_roster'), p_year * 100 + p_month);

  select true, state.is_manual
  into v_state_exists, v_is_manual
  from public.employee_month_roster_state state
  where state.year = p_year
    and state.month = p_month;

  v_state_exists := coalesce(v_state_exists, false);
  v_is_manual := coalesce(v_is_manual, v_target_date <= date_trunc('month', current_date)::date);
  v_should_refresh := not v_state_exists
    or (v_target_date > date_trunc('month', current_date)::date and v_is_manual = false);

  if not v_state_exists then
    insert into public.employee_month_roster_state (year, month, is_manual)
    values (p_year, p_month, v_is_manual)
    on conflict (year, month) do nothing;
  end if;

  if v_should_refresh then
    if v_previous_date >= date '2026-01-01' then
      -- Recursion refreshes a chain such as November -> December -> January.
      perform count(*)
      from public.get_month_roster(
        extract(year from v_previous_date)::integer,
        extract(month from v_previous_date)::integer,
        true
      );
    end if;

    perform set_config('lebuser.auto_roster_refresh', 'on', true);

    -- Keep every old row for audit/history. Rows not present in the source
    -- month are softly removed from the visible roster.
    update public.employee_months em
    set active = false,
        updated_at = now()
    where em.year = p_year
      and em.month = p_month
      and em.active = true;

    if v_previous_date >= date '2026-01-01' then
      insert into public.employee_months (
        employee_id, year, month, active, group_name, sort_order, default_start, default_end
      )
      select
        em.employee_id,
        p_year,
        p_month,
        em.active,
        em.group_name,
        em.sort_order,
        em.default_start,
        em.default_end
      from public.employee_months em
      join public.employees e on e.id = em.employee_id
      where em.year = extract(year from v_previous_date)::integer
        and em.month = extract(month from v_previous_date)::integer
        and em.active = true
        and (
          e.employment_ended_on is null
          or e.employment_ended_on > make_date(p_year, p_month, 1)
        )
      on conflict (employee_id, year, month) do update set
        active = excluded.active,
        group_name = excluded.group_name,
        sort_order = excluded.sort_order,
        default_start = excluded.default_start,
        default_end = excluded.default_end,
        updated_at = now();
    else
      insert into public.employee_months (
        employee_id, year, month, active, group_name, sort_order, default_start, default_end
      )
      select
        e.id,
        p_year,
        p_month,
        true,
        e.group_name,
        e.sort_order,
        coalesce(nullif(trim(e.default_start), ''), '7'),
        coalesce(nullif(trim(e.default_end), ''), '15')
      from public.employees e
      where e.active = true
        and (
          e.employment_ended_on is null
          or e.employment_ended_on > make_date(p_year, p_month, 1)
        )
      on conflict (employee_id, year, month) do nothing;
    end if;

    update public.employee_month_roster_state state
    set source_year = case when v_previous_date >= date '2026-01-01' then extract(year from v_previous_date)::integer end,
        source_month = case when v_previous_date >= date '2026-01-01' then extract(month from v_previous_date)::integer end,
        refreshed_at = now()
    where state.year = p_year
      and state.month = p_month;

    perform set_config('lebuser.auto_roster_refresh', 'off', true);
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
    and (
      e.employment_ended_on is null
      or e.employment_ended_on > make_date(p_year, p_month, 1)
    )
    and (p_include_inactive or em.active = true)
  order by coalesce(em.sort_order, e.sort_order, 0), e.name;
end;
$$;

create or replace function public.admin_remove_employee_from_month(
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
begin
  perform public.require_admin(p_session_token);

  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return json_build_object('error', 'Nieprawidłowy miesiąc');
  end if;

  update public.employee_months
  set active = false,
      updated_at = now()
  where employee_id = p_employee_id
    and year = p_year
    and month = p_month;

  insert into public.employee_month_roster_state (year, month, is_manual)
  values (p_year, p_month, true)
  on conflict (year, month)
  do update set is_manual = true;

  return json_build_object('ok', true);
end;
$$;

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

-- Correct the concrete stale employee reported by operations. Past months stay
-- untouched; current and future roster snapshots are only deactivated.
select set_config('lebuser.auto_roster_refresh', 'on', true);

update public.employees
set active = false,
    employment_ended_on = coalesce(
      employment_ended_on,
      date_trunc('month', current_date)::date
    )
where lower(trim(name)) = 'helak wiktor';

update public.employee_months em
set active = false,
    updated_at = now()
from public.employees e
where e.id = em.employee_id
  and lower(trim(e.name)) = 'helak wiktor'
  and make_date(em.year, em.month, 1) >= coalesce(
    e.employment_ended_on,
    date_trunc('month', current_date)::date
  );

select set_config('lebuser.auto_roster_refresh', 'off', true);

drop trigger if exists employee_month_change_marks_roster_manual on public.employee_months;
create trigger employee_month_change_marks_roster_manual
after insert or update or delete on public.employee_months
for each row execute function private.mark_employee_roster_manual();

revoke all on function public.admin_end_employee_from_month(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_end_employee_from_month(text, uuid, integer, integer) to anon, authenticated;

commit;
