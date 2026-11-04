-- Przypomnienia o pobieraniu danych z kart kierowców.
-- Ustawienie jest globalne dla pracownika, niezależne od miesięcznego składu.

begin;

alter table public.employees
  add column if not exists driver_card_required boolean not null default false,
  add column if not exists driver_card_last_downloaded_on date;

comment on column public.employees.driver_card_required is
  'Czy pracownik korzysta z karty kierowcy wymagającej regularnego pobierania danych.';
comment on column public.employees.driver_card_last_downloaded_on is
  'Data ostatniego potwierdzonego pobrania danych z karty kierowcy.';

create or replace function public.admin_save_driver_card_settings(
  p_session_token text,
  p_employee_id uuid,
  p_required boolean,
  p_last_downloaded_on date default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin(p_session_token);

  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if p_last_downloaded_on is not null and p_last_downloaded_on > current_date then
    return json_build_object('error', 'Data odczytu karty nie może być z przyszłości');
  end if;

  update public.employees
  set driver_card_required = coalesce(p_required, false),
      driver_card_last_downloaded_on = p_last_downloaded_on
  where id = p_employee_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
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
    where e.driver_card_required = true
      and e.active = true
  ) card;

  return json_build_object('ok', true, 'cards', v_cards);
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

  update public.employees
  set driver_card_last_downloaded_on = v_downloaded_on
  where id = p_employee_id
    and driver_card_required = true;

  if not found then
    return json_build_object('error', 'Nie znaleziono aktywnej karty kierowcy');
  end if;

  return json_build_object('ok', true, 'downloaded_on', v_downloaded_on);
end;
$$;

revoke all on function public.admin_save_driver_card_settings(text, uuid, boolean, date) from public, anon, authenticated;
revoke all on function public.get_driver_card_reminders(text) from public, anon, authenticated;
revoke all on function public.mark_driver_card_downloaded(text, uuid, date) from public, anon, authenticated;

grant execute on function public.admin_save_driver_card_settings(text, uuid, boolean, date) to anon, authenticated;
grant execute on function public.get_driver_card_reminders(text) to anon, authenticated;
grant execute on function public.mark_driver_card_downloaded(text, uuid, date) to anon, authenticated;

commit;
