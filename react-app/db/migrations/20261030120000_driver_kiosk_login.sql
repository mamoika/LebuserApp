-- Wspolne stanowisko przy wejsciu do pralni.
-- Administrator aktywuje konkretna przegladarke raz, a kierowcy moga potem
-- wybrac swoje konto bez wpisywania hasla. Surowy klucz urzadzenia nigdy nie
-- jest zapisywany w bazie; przechowujemy tylko jego hash.

create table if not exists public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.kiosk_devices enable row level security;
revoke all on table public.kiosk_devices from public, anon, authenticated;

alter table public.user_sessions
  add column if not exists kiosk_device_id uuid references public.kiosk_devices(id) on delete set null;

create index if not exists user_sessions_kiosk_device_idx
  on public.user_sessions(kiosk_device_id, created_at desc)
  where kiosk_device_id is not null;

create or replace function public.admin_activate_kiosk_device(
  p_session_token text,
  p_name text default 'Stanowisko wazenia'
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_device_id uuid;
  v_device_token text;
  v_name text := left(coalesce(nullif(trim(p_name), ''), 'Stanowisko wazenia'), 120);
begin
  v_admin_id := public.require_admin(p_session_token);
  v_device_token := gen_random_uuid()::text || '.' || encode(gen_random_bytes(32), 'hex');

  insert into public.kiosk_devices(name, token_hash, created_by)
  values (v_name, public.session_hash(v_device_token), v_admin_id)
  returning id into v_device_id;

  insert into public.logs (
    action, category, entity_type, entity_id, actor_user_id, details, metadata
  ) values (
    'kiosk_device_activated', 'security', 'kiosk_device', v_device_id::text,
    v_admin_id, format('Aktywowano wspolne stanowisko: %s', v_name),
    jsonb_build_object('device_name', v_name)
  );

  return json_build_object(
    'ok', true,
    'device_id', v_device_id,
    'device_name', v_name,
    'device_token', v_device_token
  );
end;
$$;

create or replace function public.get_kiosk_drivers(p_device_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device record;
  v_drivers json;
begin
  select id, name into v_device
  from public.kiosk_devices
  where token_hash = public.session_hash(p_device_token)
    and is_active = true
  limit 1;

  if v_device.id is null then
    return json_build_object('error', 'Stanowisko nie jest aktywne');
  end if;

  update public.kiosk_devices
  set last_seen_at = now()
  where id = v_device.id
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');

  select coalesce(json_agg(row_to_json(x) order by x.name), '[]'::json)
  into v_drivers
  from (
    select u.id, u.name
    from public.users u
    where u.role = 'driver'
      and coalesce(u.is_archived, false) = false
      and nullif(trim(coalesce(u.name, '')), '') is not null
  ) x;

  return json_build_object(
    'ok', true,
    'device_name', v_device.name,
    'drivers', v_drivers
  );
end;
$$;

create or replace function public.kiosk_login_driver(
  p_device_token text,
  p_user_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device record;
  v_user record;
  v_token text;
  v_expires_at timestamptz;
begin
  select id, name into v_device
  from public.kiosk_devices
  where token_hash = public.session_hash(p_device_token)
    and is_active = true
  limit 1;

  if v_device.id is null then
    return json_build_object('error', 'Stanowisko nie jest aktywne');
  end if;

  select id, username, name, role, routes, language,
    privacy_notice_ack_at, privacy_notice_ack_version
  into v_user
  from public.users
  where id = p_user_id
    and role = 'driver'
    and coalesce(is_archived, false) = false;

  if v_user.id is null then
    return json_build_object('error', 'Konto kierowcy jest niedostepne');
  end if;

  v_token := gen_random_uuid()::text || '.' || encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '4 hours';

  -- Na wspolnym komputerze moze byc aktywny tylko jeden kierowca naraz.
  update public.user_sessions
  set revoked_at = now()
  where kiosk_device_id = v_device.id
    and revoked_at is null;

  insert into public.user_sessions(
    user_id, token_hash, expires_at, kiosk_device_id, device_label
  ) values (
    v_user.id, public.session_hash(v_token), v_expires_at,
    v_device.id, left('Kiosk: ' || v_device.name, 200)
  );

  update public.kiosk_devices set last_seen_at = now() where id = v_device.id;

  insert into public.logs (
    user_name, actor_user_id, actor_role, action, category, entity_type,
    entity_id, details, metadata, device_label
  ) values (
    v_user.name, v_user.id, v_user.role, 'kiosk_login', 'security', 'user',
    v_user.id::text, format('Szybkie logowanie na stanowisku %s', v_device.name),
    jsonb_build_object('kiosk_device_id', v_device.id, 'kiosk_device_name', v_device.name),
    left('Kiosk: ' || v_device.name, 200)
  );

  return json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes,
    'language', v_user.language,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_token,
    'session_expires_at', v_expires_at,
    'kiosk_device_id', v_device.id,
    'kiosk_device_name', v_device.name
  );
end;
$$;

revoke all on function public.admin_activate_kiosk_device(text, text) from public;
revoke all on function public.get_kiosk_drivers(text) from public;
revoke all on function public.kiosk_login_driver(text, uuid) from public;

grant execute on function public.admin_activate_kiosk_device(text, text) to anon, authenticated;
grant execute on function public.get_kiosk_drivers(text) to anon, authenticated;
grant execute on function public.kiosk_login_driver(text, uuid) to anon, authenticated;
