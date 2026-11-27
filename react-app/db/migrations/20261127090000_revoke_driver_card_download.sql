begin;

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
  v_employee_name text;
  v_event public.driver_card_download_events%rowtype;
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

  -- Wszystkie zapisy odczytu blokują najpierw wiersz pracownika.
  select e.name into v_employee_name
  from public.employees e
  join public.employee_months em
    on em.employee_id = e.id
    and em.year = extract(year from v_downloaded_on)::integer
    and em.month = extract(month from v_downloaded_on)::integer
    and em.active = true
    and upper(trim(coalesce(em.group_name, ''))) = 'KIEROWCY'
  where e.id = p_employee_id and e.driver_card_required = true and e.active = true
  for no key update of e;

  if not found then
    return json_build_object('error', 'Nie znaleziono aktywnej karty kierowcy w grupie KIEROWCY');
  end if;

  insert into public.driver_card_download_events (
    employee_id, downloaded_on, recorded_by, recorded_by_name
  ) values (
    p_employee_id, v_downloaded_on, v_user.id, v_user.name
  ) on conflict (employee_id, downloaded_on) do nothing;

  update public.employees
  set driver_card_last_downloaded_on = greatest(driver_card_last_downloaded_on, v_downloaded_on)
  where id = p_employee_id;

  select * into strict v_event
  from public.driver_card_download_events
  where employee_id = p_employee_id and downloaded_on = v_downloaded_on;

  return json_build_object(
    'ok', true,
    'downloaded_on', v_downloaded_on,
    'event', json_build_object(
      'id', v_event.id,
      'employee_id', v_event.employee_id,
      'name', v_employee_name,
      'downloaded_on', v_event.downloaded_on,
      'recorded_by_name', v_event.recorded_by_name,
      'recorded_at', v_event.recorded_at
    )
  );
end;
$$;

create or replace function public.revoke_driver_card_download(
  p_session_token text,
  p_event_id uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_event public.driver_card_download_events%rowtype;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if coalesce(private.user_module_access(v_user.id, 'work_schedule'), 0) < 2 then
    raise exception 'Work schedule edit access required' using errcode = '42501';
  end if;

  perform 1 from public.employees e
  join public.driver_card_download_events h on h.employee_id = e.id
  where h.id = p_event_id
  for no key update of e;

  select * into v_event from public.driver_card_download_events where id = p_event_id;
  if not found then
    return json_build_object('status', 'missing', 'reminders', public.get_driver_card_reminders(p_session_token));
  end if;

  if exists (
    select 1 from public.driver_card_ddd_imports i
    where i.employee_id = v_event.employee_id
      and (i.downloaded_at at time zone 'Europe/Warsaw')::date = v_event.downloaded_on
  ) then
    return json_build_object('status', 'ddd');
  end if;

  delete from public.driver_card_download_events where id = v_event.id;

  update public.employees e
  set driver_card_last_downloaded_on = (
    select max(h.downloaded_on)
    from public.driver_card_download_events h
    where h.employee_id = e.id
  )
  where e.id = v_event.employee_id and e.driver_card_last_downloaded_on = v_event.downloaded_on;

  perform public.insert_log(
    p_session_token => p_session_token,
    p_action => 'driver_card_download_revoked',
    p_category => 'schedule',
    p_entity_type => 'driver_card_download',
    p_entity_id => v_event.id::text,
    p_metadata => jsonb_build_object('event', to_jsonb(v_event))
  );

  return json_build_object('status', 'removed', 'reminders', public.get_driver_card_reminders(p_session_token));
end;
$$;

revoke all on function public.revoke_driver_card_download(text, uuid) from public, anon, authenticated;
grant execute on function public.revoke_driver_card_download(text, uuid) to anon, authenticated;

commit;
