-- Ponowne potwierdzenie tego samego dnia nie nadpisuje autora pierwszego zapisu.

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
    where e.id = p_employee_id
      and e.driver_card_required = true
      and e.active = true
  ) then
    return json_build_object('error', 'Nie znaleziono aktywnej karty kierowcy');
  end if;

  insert into public.driver_card_download_events (
    employee_id,
    downloaded_on,
    recorded_by,
    recorded_by_name
  ) values (
    p_employee_id,
    v_downloaded_on,
    v_user.id,
    v_user.name
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

revoke all on function public.mark_driver_card_downloaded(text, uuid, date) from public, anon, authenticated;
grant execute on function public.mark_driver_card_downloaded(text, uuid, date) to anon, authenticated;

commit;
