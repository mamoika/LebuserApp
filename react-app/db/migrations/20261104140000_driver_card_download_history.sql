-- Historia odczytów kart kierowców i udostępnienie jej w grafiku.

begin;

create table if not exists public.driver_card_download_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  downloaded_on date not null,
  recorded_by uuid references public.users(id) on delete set null,
  recorded_by_name text,
  recorded_at timestamptz not null default now(),
  constraint driver_card_download_events_employee_day_unique unique (employee_id, downloaded_on)
);

comment on table public.driver_card_download_events is
  'Niezmienna historia potwierdzonych odczytów kart kierowców.';

create index if not exists driver_card_download_events_downloaded_on_idx
  on public.driver_card_download_events (downloaded_on desc);

alter table public.driver_card_download_events enable row level security;
revoke all on table public.driver_card_download_events from public, anon, authenticated;

-- Zachowaj daty wprowadzone przed dodaniem historii.
insert into public.driver_card_download_events (
  employee_id,
  downloaded_on,
  recorded_by_name
)
select
  e.id,
  e.driver_card_last_downloaded_on,
  'Migracja ustawień'
from public.employees e
where e.driver_card_required = true
  and e.driver_card_last_downloaded_on is not null
on conflict (employee_id, downloaded_on) do nothing;

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

  update public.employees
  set driver_card_required = coalesce(p_required, false),
      driver_card_last_downloaded_on = p_last_downloaded_on
  where id = p_employee_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  if coalesce(p_required, false) and p_last_downloaded_on is not null then
    insert into public.driver_card_download_events (
      employee_id,
      downloaded_on,
      recorded_by,
      recorded_by_name
    ) values (
      p_employee_id,
      p_last_downloaded_on,
      v_user.id,
      v_user.name
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
  on conflict (employee_id, downloaded_on) do update
  set recorded_by = excluded.recorded_by,
      recorded_by_name = excluded.recorded_by_name,
      recorded_at = now();

  update public.employees
  set driver_card_last_downloaded_on = greatest(
    coalesce(driver_card_last_downloaded_on, v_downloaded_on),
    v_downloaded_on
  )
  where id = p_employee_id;

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
