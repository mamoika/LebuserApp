-- Prywatne archiwum plików DDD z kart kierowców, używane przez Dyspozytornię.

begin;

alter table public.employees
  add column if not exists driver_card_number text;

comment on column public.employees.driver_card_number is
  'Pełny numer karty kierowcy odczytany ze zweryfikowanego pliku DDD. Dostęp wyłącznie przez zabezpieczone RPC.';

create unique index if not exists employees_driver_card_number_unique_idx
  on public.employees (driver_card_number)
  where driver_card_number is not null;

create table if not exists public.driver_card_ddd_imports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  file_name text not null,
  file_sha256 text not null,
  file_data bytea not null,
  file_size integer not null,
  card_number text not null,
  generation text not null,
  downloaded_at timestamptz not null,
  activity_first_on date,
  activity_last_on date,
  activity_days integer not null default 0,
  vehicle_sessions integer not null default 0,
  event_count integer not null default 0,
  fault_count integer not null default 0,
  signature_status text not null,
  signatures_verified integer not null default 0,
  signatures_total integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  imported_by uuid references public.users(id) on delete set null,
  imported_by_name text,
  imported_at timestamptz not null default now(),
  constraint driver_card_ddd_imports_sha256_unique unique (file_sha256),
  constraint driver_card_ddd_imports_sha256_format check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint driver_card_ddd_imports_file_size check (file_size > 0 and file_size <= 2097152),
  constraint driver_card_ddd_imports_signature_status check (signature_status in ('verified', 'invalid', 'unverified')),
  constraint driver_card_ddd_imports_signature_counts check (
    signatures_verified >= 0 and signatures_total >= signatures_verified
  )
);

comment on table public.driver_card_ddd_imports is
  'Niezmienna, prywatna kopia oryginalnych plików DDD oraz ich zweryfikowanego podsumowania.';

create index if not exists driver_card_ddd_imports_employee_downloaded_idx
  on public.driver_card_ddd_imports (employee_id, downloaded_at desc);

create index if not exists driver_card_ddd_imports_imported_at_idx
  on public.driver_card_ddd_imports (imported_at desc);

alter table public.driver_card_ddd_imports enable row level security;
revoke all on table public.driver_card_ddd_imports from public, anon, authenticated;

create or replace function public.get_dispatch_ddd_context(p_session_token text)
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
  if coalesce(private.user_module_access(v_user.id, 'live_routes'), 0) < 1 then
    raise exception 'Live routes access required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(driver_row) order by driver_row.name), '[]'::json)
  into v_drivers
  from (
    select
      e.id as employee_id,
      e.name,
      e.driver_card_number as card_number
    from public.employees e
    where e.active = true
      and e.driver_card_required = true
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
    order by i.imported_at desc
    limit 30
  ) import_row;

  return json_build_object(
    'ok', true,
    'drivers', v_drivers,
    'imports', v_imports
  );
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
  if coalesce(private.user_module_access(v_user.id, 'live_routes'), 0) < 2 then
    raise exception 'Live routes edit access required' using errcode = '42501';
  end if;

  if p_employee_id is null or not exists (
    select 1
    from public.employees e
    where e.id = p_employee_id
      and e.active = true
      and e.driver_card_required = true
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
    select 1
    from public.employees e
    where e.driver_card_number = p_card_number
      and e.id <> p_employee_id
  ) then
    return json_build_object('error', 'Numer tej karty jest już przypisany do innego kierowcy');
  end if;

  update public.employees
  set driver_card_number = p_card_number
  where id = p_employee_id;

  insert into public.driver_card_ddd_imports (
    employee_id,
    file_name,
    file_sha256,
    file_data,
    file_size,
    card_number,
    generation,
    downloaded_at,
    activity_first_on,
    activity_last_on,
    activity_days,
    vehicle_sessions,
    event_count,
    fault_count,
    signature_status,
    signatures_verified,
    signatures_total,
    summary,
    imported_by,
    imported_by_name
  ) values (
    p_employee_id,
    p_file_name,
    p_file_sha256,
    v_file_data,
    octet_length(v_file_data),
    p_card_number,
    p_generation,
    p_downloaded_at,
    p_activity_first_on,
    p_activity_last_on,
    greatest(coalesce(p_activity_days, 0), 0),
    greatest(coalesce(p_vehicle_sessions, 0), 0),
    greatest(coalesce(p_event_count, 0), 0),
    greatest(coalesce(p_fault_count, 0), 0),
    p_signature_status,
    greatest(coalesce(p_signatures_verified, 0), 0),
    greatest(coalesce(p_signatures_total, 0), 0),
    coalesce(p_summary, '{}'::jsonb),
    v_user.id,
    v_user.name
  )
  returning id into v_import_id;

  v_downloaded_on := (p_downloaded_at at time zone 'Europe/Warsaw')::date;

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

  return json_build_object('ok', true, 'duplicate', false, 'import_id', v_import_id);
end;
$$;

revoke all on function public.get_dispatch_ddd_context(text) from public, anon, authenticated;
revoke all on function public.save_driver_card_ddd_import(
  text, uuid, text, text, text, text, text, timestamptz, date, date,
  integer, integer, integer, integer, text, integer, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.get_dispatch_ddd_context(text) to anon, authenticated;
grant execute on function public.save_driver_card_ddd_import(
  text, uuid, text, text, text, text, text, timestamptz, date, date,
  integer, integer, integer, integer, text, integer, integer, jsonb
) to anon, authenticated;

commit;
