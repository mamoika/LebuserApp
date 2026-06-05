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

  if not exists (
    select 1 from public.employee_months em
    where em.year = p_year and em.month = p_month
  ) then
    select em.year, em.month
    into v_prev_year, v_prev_month
    from public.employee_months em
    where em.year < p_year
       or (em.year = p_year and em.month < p_month)
    order by em.year desc, em.month desc
    limit 1;

    if v_prev_year is not null then
      insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
      select em.employee_id, p_year, p_month, true, em.group_name, em.sort_order
      from public.employee_months em
      where em.year = v_prev_year
        and em.month = v_prev_month
        and em.active = true
      on conflict (employee_id, year, month) do nothing;
    else
      insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
      select e.id, p_year, p_month, true, e.group_name, e.sort_order
      from public.employees e
      where e.active = true
      on conflict (employee_id, year, month) do nothing;
    end if;
  end if;

  return query
  select
    e.id,
    e.name,
    e.default_start,
    e.default_end,
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
begin
  perform public.require_admin(p_session_token);

  v_name := nullif(trim(coalesce(p_name, '')), '');
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
      coalesce(nullif(trim(coalesce(p_default_start, '')), ''), '7'),
      coalesce(nullif(trim(coalesce(p_default_end, '')), ''), '15'),
      true,
      coalesce(p_sort_order, 0)
    )
    returning id into v_employee_id;
  else
    update public.employees
    set name = v_name,
        contract_type = coalesce(nullif(trim(coalesce(p_contract_type, '')), ''), 'UoP'),
        default_start = coalesce(nullif(trim(coalesce(p_default_start, '')), ''), '7'),
        default_end = coalesce(nullif(trim(coalesce(p_default_end, '')), ''), '15')
    where id = p_employee_id
    returning id into v_employee_id;

    if v_employee_id is null then
      return json_build_object('error', 'Nie znaleziono pracownika');
    end if;
  end if;

  insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
  values (
    v_employee_id,
    p_year,
    p_month,
    coalesce(p_active, true),
    nullif(trim(coalesce(p_group_name, '')), ''),
    coalesce(p_sort_order, 0)
  )
  on conflict (employee_id, year, month)
  do update set
    active = excluded.active,
    group_name = excluded.group_name,
    sort_order = excluded.sort_order,
    updated_at = now();

  return json_build_object('ok', true, 'id', v_employee_id);
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

  delete from public.employee_months
  where employee_id = p_employee_id
    and year = p_year
    and month = p_month;

  return json_build_object('ok', true);
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
  v_exists boolean;
begin
  perform public.require_admin(p_session_token);

  select exists (select 1 from public.employees where id = p_employee_id) into v_exists;
  if not v_exists then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  insert into public.employee_months (employee_id, year, month, active, group_name, sort_order)
  values (
    p_employee_id,
    p_year,
    p_month,
    true,
    nullif(trim(coalesce(p_group_name, '')), ''),
    coalesce(p_sort_order, 0)
  )
  on conflict (employee_id, year, month)
  do update set
    active = true,
    group_name = excluded.group_name,
    sort_order = excluded.sort_order,
    updated_at = now();

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.get_month_roster(integer, integer, boolean) to anon, authenticated;
grant execute on function public.admin_save_employee(text, uuid, integer, integer, text, text, text, text, text, boolean, integer) to anon, authenticated;
grant execute on function public.admin_remove_employee_from_month(text, uuid, integer, integer) to anon, authenticated;
grant execute on function public.admin_add_employee_to_month(text, uuid, integer, integer, text, integer) to anon, authenticated;

revoke insert, update, delete on table public.employees from anon, authenticated;
revoke insert, update, delete on table public.employee_months from anon, authenticated;
