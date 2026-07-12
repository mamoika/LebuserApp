-- Rozszerzenie atomowego zapisu profilu o nazwę widoczną w formularzu.
drop function if exists public.admin_update_user_profile(text, uuid, text, text, uuid, text);

create or replace function public.admin_update_user_profile(
  p_session_token text,
  p_user_id uuid,
  p_name text,
  p_role text,
  p_routes text,
  p_employee_id uuid default null,
  p_car text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text := lower(trim(coalesce(p_role, '')));
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_old_role text;
  v_driver_cars jsonb := '{}'::jsonb;
begin
  perform public.require_admin(p_session_token);
  if v_name is null then return json_build_object('error', 'Nazwa użytkownika jest wymagana'); end if;
  if v_role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'viewer', 'tunnel', 'packer') then
    return json_build_object('error', 'Nieprawidłowa rola');
  end if;
  if p_employee_id is not null and not exists (select 1 from public.employees where id = p_employee_id) then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  select role into v_old_role from public.users where id = p_user_id for update;
  if v_old_role is null then return json_build_object('error', 'Nie znaleziono użytkownika'); end if;
  update public.users
  set name = v_name,
      role = v_role,
      routes = nullif(trim(coalesce(p_routes, '')), ''),
      employee_id = case
        when v_role in ('admin', 'driver', 'admin_viewer_driver') then p_employee_id
        else null
      end
  where id = p_user_id;

  insert into public.app_settings (key, value, updated_at)
  values ('driver_cars', '{}'::jsonb, now()) on conflict (key) do nothing;
  select coalesce(value, '{}'::jsonb) into v_driver_cars
  from public.app_settings where key = 'driver_cars' for update;
  if nullif(trim(coalesce(p_car, '')), '') is null then
    v_driver_cars := v_driver_cars - p_user_id::text;
  else
    v_driver_cars := jsonb_set(v_driver_cars, array[p_user_id::text], to_jsonb(trim(p_car)), true);
  end if;
  update public.app_settings set value = v_driver_cars, updated_at = now() where key = 'driver_cars';

  if v_old_role is distinct from v_role then
    update public.user_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null;
  end if;
  return json_build_object('ok', true, 'driver_cars', v_driver_cars);
exception
  when unique_violation then
    return json_build_object('error', 'Ten pracownik jest już przypisany do innego konta');
end;
$$;

revoke execute on function public.admin_update_user_profile(text, uuid, text, text, text, uuid, text) from public;
grant execute on function public.admin_update_user_profile(text, uuid, text, text, text, uuid, text) to anon, authenticated;

-- Używaj tego samego klucza blokady co zatwierdzanie/odrzucanie raportu.
create or replace function public.driver_finish_trip_with_time(
  p_session_token text,
  p_trip_id uuid,
  p_end_km numeric,
  p_work_start time,
  p_work_end time
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trip public.driver_trips;
  v_report_user_id uuid;
  v_report_user_name text;
  v_employee_id uuid;
  v_minutes integer;
  v_report public.work_time_reports;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'driver', 'admin_viewer_driver') then
    raise exception 'Driver session required' using errcode = '42501';
  end if;
  select * into v_trip from public.driver_trips where id = p_trip_id;
  if v_trip.id is null then return json_build_object('error', 'Nie znaleziono trasy'); end if;
  if v_user.role <> 'admin' and v_trip.driver_id is distinct from v_user.id then
    return json_build_object('error', 'To nie Twoja trasa');
  end if;
  if v_trip.status <> 'active' then return json_build_object('error', 'Tylko aktywną trasę można zakończyć'); end if;
  if p_end_km is null then return json_build_object('error', 'Brak licznika końcowego'); end if;

  v_report_user_id := v_trip.driver_id;
  if v_report_user_id is null then return json_build_object('error', 'Trasa nie ma przypisanego kierowcy'); end if;
  select employee_id, name into v_employee_id, v_report_user_name
  from public.users where id = v_report_user_id;
  if v_employee_id is null then return json_build_object('error', 'Konto nie jest przypisane do pracownika w grafiku'); end if;

  v_minutes := private.work_minutes_between(p_work_start, p_work_end);
  if v_minutes is null or v_minutes < 1 or v_minutes >= 1440 then
    return json_build_object('error', 'Nieprawidłowy zakres godzin pracy');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_report_user_id::text || ':' || v_trip.trip_date::text, 0));
  if exists (
    select 1 from public.work_time_reports
    where employee_id = v_employee_id and work_date = v_trip.trip_date and status = 'approved'
  ) then return json_build_object('error', 'Godziny tego dnia zostały już zatwierdzone'); end if;

  update public.driver_trips
  set ended_at = now(), end_km = p_end_km, status = 'finished'
  where id = p_trip_id returning * into v_trip;
  v_report := null;
  insert into public.work_time_reports (
    user_id, user_name, employee_id, work_date, source_trip_id,
    reported_start, reported_end, reported_minutes
  ) values (
    v_report_user_id, v_report_user_name, v_employee_id, v_trip.trip_date, v_trip.id,
    p_work_start, p_work_end, v_minutes
  )
  on conflict (employee_id, work_date) do update set
    user_id = excluded.user_id,
    user_name = excluded.user_name,
    source_trip_id = excluded.source_trip_id,
    reported_start = excluded.reported_start,
    reported_end = excluded.reported_end,
    reported_minutes = excluded.reported_minutes,
    reported_at = now(),
    status = 'pending',
    approved_start = null,
    approved_end = null,
    approved_minutes = null,
    approved_by_user_id = null,
    approved_by_name = null,
    approved_at = null,
    rejection_note = null,
    updated_at = now()
  where public.work_time_reports.status <> 'approved'
  returning * into v_report;
  if v_report.id is null then
    raise exception 'Godziny tego dnia zostały już zatwierdzone' using errcode = 'P0001';
  end if;
  insert into public.work_time_report_events (
    report_id, event_type, actor_user_id, actor_name, work_start, work_end, work_minutes
  ) values (
    v_report.id, 'submitted', v_user.id, v_user.name, p_work_start, p_work_end, v_minutes
  );
  return json_build_object('ok', true, 'trip', row_to_json(v_trip), 'work_time_report', row_to_json(v_report));
exception
  when unique_violation then
    return json_build_object('error', 'Istnieje już inne zgłoszenie tego konta dla tego dnia');
end;
$$;
