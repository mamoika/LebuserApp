-- Przenosi pełną obsługę plików DDD z Dyspozytorni do kart kierowców w Grafiku.

begin;

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
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 1 then
    raise exception 'Work schedule access required' using errcode = '42501';
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
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 1 then
    raise exception 'Work schedule access required' using errcode = '42501';
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

create or replace function public.save_driver_card_ddd_import(
  p_session_token text,
  p_employee_id uuid,
  p_file_name text,
  p_file_sha256 text,
  p_file_base64 text,
  p_card_number text,
  p_generation text,
  p_downloaded_at timestamptz,
  p_activity_first_on date default null,
  p_activity_last_on date default null,
  p_activity_days integer default 0,
  p_vehicle_sessions integer default 0,
  p_event_count integer default 0,
  p_fault_count integer default 0,
  p_signature_status text default 'unverified',
  p_signatures_verified integer default 0,
  p_signatures_total integer default 0,
  p_summary jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_file_data bytea;
  v_import_id uuid;
  v_existing_employee_id uuid;
  v_downloaded_on date;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;

  if p_employee_id is null or not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.active = true and e.driver_card_required = true
  ) then
    return json_build_object('error', 'Nie znaleziono aktywnego kierowcy z kartą');
  end if;
  if nullif(btrim(p_file_name), '') is null or lower(p_file_name) not like '%.ddd' then
    return json_build_object('error', 'Nieprawidłowa nazwa pliku DDD');
  end if;
  if p_file_sha256 !~ '^[0-9a-f]{64}$' then
    return json_build_object('error', 'Nieprawidłowy skrót pliku');
  end if;
  if nullif(btrim(p_card_number), '') is null then
    return json_build_object('error', 'Brak numeru karty w pliku');
  end if;
  if p_signature_status <> 'verified'
     or coalesce(p_signatures_total, 0) < 1
     or coalesce(p_signatures_verified, 0) <> coalesce(p_signatures_total, 0) then
    return json_build_object('error', 'Plik nie ma kompletu poprawnych podpisów');
  end if;
  if p_downloaded_at is null or p_downloaded_at > now() + interval '5 minutes' then
    return json_build_object('error', 'Nieprawidłowa data odczytu pliku');
  end if;

  begin
    v_file_data := decode(p_file_base64, 'base64');
  exception when others then
    return json_build_object('error', 'Nieprawidłowa zawartość pliku');
  end;
  if octet_length(v_file_data) < 32 or octet_length(v_file_data) > 2097152 then
    return json_build_object('error', 'Rozmiar pliku DDD jest poza dozwolonym zakresem');
  end if;

  select i.id, i.employee_id
  into v_import_id, v_existing_employee_id
  from public.driver_card_ddd_imports i
  where i.file_sha256 = p_file_sha256;

  if v_import_id is not null then
    if v_existing_employee_id <> p_employee_id then
      return json_build_object('error', 'Ten plik jest już przypisany do innego kierowcy');
    end if;
    return json_build_object('ok', true, 'duplicate', true, 'import_id', v_import_id);
  end if;

  if exists (
    select 1 from public.employees e
    where e.driver_card_number = p_card_number and e.id <> p_employee_id
  ) then
    return json_build_object('error', 'Numer tej karty jest już przypisany do innego kierowcy');
  end if;

  update public.employees set driver_card_number = p_card_number where id = p_employee_id;

  insert into public.driver_card_ddd_imports (
    employee_id, file_name, file_sha256, file_data, file_size, card_number, generation,
    downloaded_at, activity_first_on, activity_last_on, activity_days, vehicle_sessions,
    event_count, fault_count, signature_status, signatures_verified, signatures_total,
    summary, imported_by, imported_by_name
  ) values (
    p_employee_id, p_file_name, p_file_sha256, v_file_data, octet_length(v_file_data),
    p_card_number, p_generation, p_downloaded_at, p_activity_first_on, p_activity_last_on,
    greatest(coalesce(p_activity_days, 0), 0), greatest(coalesce(p_vehicle_sessions, 0), 0),
    greatest(coalesce(p_event_count, 0), 0), greatest(coalesce(p_fault_count, 0), 0),
    p_signature_status, greatest(coalesce(p_signatures_verified, 0), 0),
    greatest(coalesce(p_signatures_total, 0), 0), coalesce(p_summary, '{}'::jsonb),
    v_user.id, v_user.name
  ) returning id into v_import_id;

  v_downloaded_on := (p_downloaded_at at time zone 'Europe/Warsaw')::date;

  insert into public.driver_card_download_events (
    employee_id, downloaded_on, recorded_by, recorded_by_name
  ) values (
    p_employee_id, v_downloaded_on, v_user.id, v_user.name
  ) on conflict (employee_id, downloaded_on) do nothing;

  update public.employees
  set driver_card_last_downloaded_on = greatest(
    coalesce(driver_card_last_downloaded_on, v_downloaded_on), v_downloaded_on
  )
  where id = p_employee_id;

  return json_build_object('ok', true, 'duplicate', false, 'import_id', v_import_id);
end;
$$;

revoke all on function public.get_work_schedule_ddd_context(text, uuid) from public, anon, authenticated;
revoke all on function public.get_work_schedule_ddd_import_detail(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_dispatch_ddd_context(text) from public, anon, authenticated;
revoke all on function public.get_dispatch_ddd_import_detail(text, uuid) from public, anon, authenticated;
revoke all on function public.save_driver_card_ddd_import(
  text, uuid, text, text, text, text, text, timestamptz, date, date,
  integer, integer, integer, integer, text, integer, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.get_work_schedule_ddd_context(text, uuid) to anon, authenticated;
grant execute on function public.get_work_schedule_ddd_import_detail(text, uuid, uuid) to anon, authenticated;
grant execute on function public.save_driver_card_ddd_import(
  text, uuid, text, text, text, text, text, timestamptz, date, date,
  integer, integer, integer, integer, text, integer, integer, jsonb
) to anon, authenticated;

comment on table public.driver_card_ddd_imports is
  'Prywatne archiwum plików DDD obsługiwane z kart kierowców w module Grafik.';

commit;
