-- Umożliwia kierowcom podgląd własnego przypomnienia o karcie oraz własnego archiwum DDD
-- bez konieczności posiadania pełnego dostępu do modułu Grafiku (work_schedule).

begin;

create or replace function public.get_driver_card_reminders(p_session_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_cards json;
  v_is_work_schedule boolean;
  v_user_employee_id uuid;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  v_is_work_schedule := coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) >= 1;

  if v_is_work_schedule then
    select coalesce(json_agg(row_to_json(card) order by card.name), '[]'::json)
    into v_cards
    from (
      select
        e.id as employee_id,
        e.name,
        e.driver_card_last_downloaded_on as last_downloaded_on
      from public.employees e
      where e.driver_card_required = true
        and e.active = true
    ) card;
  else
    select coalesce(u.employee_id, (select id from public.employees where lower(name) = lower(u.name) and active = true limit 1))
    into v_user_employee_id
    from public.users u
    where u.id = v_user.id;

    if v_user_employee_id is null then
      return json_build_object('ok', true, 'cards', '[]'::json);
    end if;

    select coalesce(json_agg(row_to_json(card)), '[]'::json)
    into v_cards
    from (
      select
        e.id as employee_id,
        e.name,
        e.driver_card_last_downloaded_on as last_downloaded_on
      from public.employees e
      where e.id = v_user_employee_id
        and e.driver_card_required = true
        and e.active = true
      limit 1
    ) card;
  end if;

  return json_build_object('ok', true, 'cards', v_cards);
end;
$$;

create or replace function public.get_work_schedule_ddd_context(
  p_session_token text,
  p_employee_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_drivers json;
  v_imports json;
  v_is_work_schedule boolean;
  v_user_employee_id uuid;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  v_is_work_schedule := coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) >= 1;

  if not v_is_work_schedule then
    select coalesce(u.employee_id, (select id from public.employees where lower(name) = lower(u.name) and active = true limit 1))
    into v_user_employee_id
    from public.users u
    where u.id = v_user.id;

    if v_user_employee_id is null or (p_employee_id is not null and p_employee_id <> v_user_employee_id) then
      raise exception 'Work schedule access required' using errcode = '42501';
    end if;
    p_employee_id := v_user_employee_id;
  end if;

  select coalesce(json_agg(row_to_json(driver_row) order by driver_row.name), '[]'::json)
  into v_drivers
  from (
    select e.id as employee_id, e.name, e.driver_card_number as card_number
    from public.employees e
    where e.active = true
      and e.driver_card_required = true
      and (p_employee_id is null or e.id = p_employee_id)
    order by e.name
  ) driver_row;

  select coalesce(json_agg(row_to_json(import_row) order by import_row.imported_at desc), '[]'::json)
  into v_imports
  from (
    select
      i.id,
      i.employee_id,
      e.name as employee_name,
      i.file_name,
      i.downloaded_at,
      i.imported_at,
      i.generation,
      i.signature_status,
      i.activity_first_on,
      i.activity_last_on,
      i.activity_days,
      i.signatures_verified,
      i.signatures_total
    from public.driver_card_ddd_imports i
    join public.employees e on e.id = i.employee_id
    where p_employee_id is null or i.employee_id = p_employee_id
    order by i.imported_at desc
    limit case when p_employee_id is null then 30 else 100 end
  ) import_row;

  return json_build_object('ok', true, 'drivers', v_drivers, 'imports', v_imports);
end;
$$;

create or replace function public.get_work_schedule_ddd_import_detail(
  p_session_token text,
  p_import_id uuid,
  p_employee_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_summary jsonb;
  v_is_work_schedule boolean;
  v_user_employee_id uuid;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  v_is_work_schedule := coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) >= 1;

  if not v_is_work_schedule then
    select coalesce(u.employee_id, (select id from public.employees where lower(name) = lower(u.name) and active = true limit 1))
    into v_user_employee_id
    from public.users u
    where u.id = v_user.id;

    if v_user_employee_id is null or (p_employee_id is not null and p_employee_id <> v_user_employee_id) then
      raise exception 'Work schedule access required' using errcode = '42501';
    end if;
    p_employee_id := v_user_employee_id;
  end if;

  select i.summary - 'card_number' - 'sha256'
  into v_summary
  from public.driver_card_ddd_imports i
  where i.id = p_import_id
    and (p_employee_id is null or i.employee_id = p_employee_id);

  if v_summary is null then
    return json_build_object('error', 'Nie znaleziono odczytu DDD');
  end if;

  return json_build_object('ok', true, 'summary', v_summary);
end;
$$;

grant execute on function public.get_driver_card_reminders(text) to anon, authenticated;
grant execute on function public.get_work_schedule_ddd_context(text, uuid) to anon, authenticated;
grant execute on function public.get_work_schedule_ddd_import_detail(text, uuid, uuid) to anon, authenticated;

commit;
