-- Edytowalne stanowiska (dziś sztywna lista T/S/M/R/PR/P/SZ/PP/SP/O/PK/SC/K w kodzie JS).
-- Każde stanowisko należy do dokładnie jednej grupy (public.groups) — to ta relacja,
-- a nie stała grupa pracownika, decyduje do której grupy liczą się godziny w tabeli
-- Suma na Osi czasu. Stanowisko wykonywane w kilku grupach (np. Pranie na ZD1 i ZD2)
-- modelujemy jako osobny wiersz per grupa (ten sam name_pl/name_de, inny code).

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_pl text not null,
  name_de text not null,
  color text not null default '#455a64',
  text_color text not null default '#ffffff',
  group_id uuid not null references public.groups(id),
  sort_order integer not null default 9999,
  created_at timestamptz not null default now()
);

-- Seed: dzisiejsze 13 stanowisk, tymczasowo przypięte do grupy o najniższym sort_order
-- (dowolna jedna grupa — placeholder). To trzeba potem przejrzeć w Panel Admina →
-- Stanowiska i rozdzielić (np. dodać "Magiel" jako osobny wpis dla ZD2, zduplikować
-- "Pranie" dla ZD2 itd.).
insert into public.roles (code, name_pl, name_de, color, text_color, group_id, sort_order)
select v.code, v.name_pl, v.name_de, v.color, v.text_color,
       (select id from public.groups order by sort_order, name limit 1),
       v.sort_order
from (values
  ('T',  'Tunel',          'Tunnel',        '#607D8B', '#ffffff', 10),
  ('S',  'Składarka',      'Faltmaschine',  '#2E7D32', '#ffffff', 20),
  ('M',  'Magiel',         'Mangel',        '#E65100', '#ffffff', 30),
  ('R',  'Roztrzepywanie', 'Aufschütteln',  '#C62828', '#ffffff', 40),
  ('PR', 'Pranie',         'Waschen',       '#00838F', '#ffffff', 50),
  ('P',  'Prasowanie',     'Bügeln',        '#6A1B9A', '#ffffff', 60),
  ('SZ', 'Szycie',         'Näherei',       '#4E342E', '#ffffff', 70),
  ('PP', 'Punkt przyjęć',  'Annahme',       '#F9A825', '#1a1a1a', 80),
  ('SP', 'Sprzątanie',     'Reinigung',     '#37474F', '#ffffff', 90),
  ('O',  'Oznakowanie',    'Kennzeichnung', '#AD1457', '#ffffff', 100),
  ('PK', 'Pakowanie',      'Verpackung',    '#558B2F', '#ffffff', 110),
  ('SC', 'Spedycja',       'Versand',       '#FF6F00', '#ffffff', 120),
  ('K',  'Kierowca',       'Fahrer',        '#1155cc', '#ffffff', 130)
) as v(code, name_pl, name_de, color, text_color, sort_order)
where exists (select 1 from public.groups)
on conflict (code) do nothing;

create or replace function public.get_admin_roles(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_roles json;
begin
  perform public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_roles
  from (
    select r.id, r.code, r.name_pl, r.name_de, r.color, r.text_color, r.group_id, g.name as group_name, r.sort_order
    from public.roles r
    join public.groups g on g.id = r.group_id
    order by r.sort_order, r.code
  ) x;

  return json_build_object('ok', true, 'roles', v_roles);
end;
$$;

create or replace function public.admin_create_role(
  p_session_token text,
  p_code text,
  p_name_pl text,
  p_name_de text,
  p_group_id uuid,
  p_color text default '#455a64',
  p_text_color text default '#ffffff',
  p_sort_order integer default 9999
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  perform public.require_admin(p_session_token);

  v_code := upper(trim(coalesce(p_code, '')));
  if v_code = '' then
    return json_build_object('error', 'Kod stanowiska jest wymagany');
  end if;
  if nullif(trim(coalesce(p_name_pl, '')), '') is null then
    return json_build_object('error', 'Nazwa stanowiska (PL) jest wymagana');
  end if;
  if p_group_id is null or not exists (select 1 from public.groups where id = p_group_id) then
    return json_build_object('error', 'Wybierz grupę, do której należy stanowisko');
  end if;

  insert into public.roles(code, name_pl, name_de, group_id, color, text_color, sort_order)
  values (
    v_code,
    trim(p_name_pl),
    coalesce(nullif(trim(p_name_de), ''), trim(p_name_pl)),
    p_group_id,
    coalesce(nullif(trim(p_color), ''), '#455a64'),
    coalesce(nullif(trim(p_text_color), ''), '#ffffff'),
    coalesce(p_sort_order, 9999)
  )
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return json_build_object('error', 'Stanowisko o tym kodzie już istnieje');
end;
$$;

create or replace function public.admin_update_role(
  p_session_token text,
  p_role_id uuid,
  p_code text,
  p_name_pl text,
  p_name_de text,
  p_group_id uuid,
  p_color text default '#455a64',
  p_text_color text default '#ffffff',
  p_sort_order integer default 9999
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_code text;
  v_new_code text;
begin
  perform public.require_admin(p_session_token);

  v_new_code := upper(trim(coalesce(p_code, '')));
  if v_new_code = '' then
    return json_build_object('error', 'Kod stanowiska jest wymagany');
  end if;
  if nullif(trim(coalesce(p_name_pl, '')), '') is null then
    return json_build_object('error', 'Nazwa stanowiska (PL) jest wymagana');
  end if;
  if p_group_id is null or not exists (select 1 from public.groups where id = p_group_id) then
    return json_build_object('error', 'Wybierz grupę, do której należy stanowisko');
  end if;

  select code into v_old_code from public.roles where id = p_role_id;
  if v_old_code is null then
    return json_build_object('error', 'Nie znaleziono stanowiska');
  end if;

  update public.roles
  set code = v_new_code,
      name_pl = trim(p_name_pl),
      name_de = coalesce(nullif(trim(p_name_de), ''), trim(p_name_pl)),
      group_id = p_group_id,
      color = coalesce(nullif(trim(p_color), ''), '#455a64'),
      text_color = coalesce(nullif(trim(p_text_color), ''), '#ffffff'),
      sort_order = coalesce(p_sort_order, 9999)
  where id = p_role_id;

  if v_new_code <> v_old_code then
    update public.timeline_entries
    set role = v_new_code
    where role = v_old_code;
  end if;

  return json_build_object('ok', true);
exception
  when unique_violation then
    return json_build_object('error', 'Stanowisko o tym kodzie już istnieje');
end;
$$;

create or replace function public.admin_delete_role(
  p_session_token text,
  p_role_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_count integer;
begin
  perform public.require_admin(p_session_token);

  select code into v_code from public.roles where id = p_role_id;
  if v_code is null then
    return json_build_object('error', 'Nie znaleziono stanowiska');
  end if;

  select count(*) into v_count from public.timeline_entries where role = v_code;
  if v_count > 0 then
    return json_build_object('error', format('Nie można usunąć stanowiska użytego w %s wpisach osi czasu.', v_count));
  end if;

  delete from public.roles where id = p_role_id;

  return json_build_object('ok', true);
end;
$$;

-- get_timeline_week: pełne przedefiniowanie, dorzuca listę stanowisk (v_roles) obok
-- roster/timeline_entries/schedule_entries/groups, które już zwracał.
create or replace function public.get_timeline_week(
  p_session_token text,
  p_date_from date,
  p_date_to date,
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
  v_roster json;
  v_timeline json;
  v_schedule json;
  v_groups json;
  v_roles json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_roster
  from (
    select *
    from public.get_month_roster(p_year, p_month, false)
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_timeline
  from (
    select *
    from public.timeline_entries
    where entry_date >= p_date_from and entry_date <= p_date_to
    order by entry_date, employee_id, hour
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_schedule
  from (
    select employee_id, day, value
    from public.schedule_entries
    where year = p_year and month = p_month
    order by employee_id, day
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_groups
  from (
    select *
    from public.groups
    order by sort_order, name
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_roles
  from (
    select r.id, r.code, r.name_pl, r.name_de, r.color, r.text_color, r.group_id, g.name as group_name, r.sort_order
    from public.roles r
    join public.groups g on g.id = r.group_id
    order by r.sort_order, r.code
  ) x;

  return json_build_object(
    'ok', true,
    'roster', v_roster,
    'timeline_entries', v_timeline,
    'schedule_entries', v_schedule,
    'groups', v_groups,
    'roles', v_roles
  );
end;
$$;

grant execute on function public.get_admin_roles(text) to anon, authenticated;
grant execute on function public.admin_create_role(text, text, text, text, uuid, text, text, integer) to anon, authenticated;
grant execute on function public.admin_update_role(text, uuid, text, text, text, uuid, text, text, integer) to anon, authenticated;
grant execute on function public.admin_delete_role(text, uuid) to anon, authenticated;
grant execute on function public.get_timeline_week(text, date, date, integer, integer) to anon, authenticated;

revoke insert, update, delete on table public.roles from anon, authenticated;
