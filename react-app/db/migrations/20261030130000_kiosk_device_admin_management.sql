-- Panel administracyjny aktywowanych stanowisk pralni.
-- Tabela nadal nie jest dostepna bezposrednio przez API; zarzadzanie odbywa
-- sie wyłącznie przez funkcje sprawdzajace aktywna sesje administratora.

create or replace function public.admin_get_kiosk_devices(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_devices json;
begin
  v_admin_id := public.require_admin(p_session_token);

  select coalesce(json_agg(row_to_json(device_row) order by device_row.is_active desc, device_row.last_seen_at desc nulls last, device_row.created_at desc), '[]'::json)
  into v_devices
  from (
    select
      kd.id,
      kd.name,
      kd.is_active,
      kd.created_at,
      kd.last_seen_at,
      creator.name as created_by_name,
      active_session.driver_name as active_driver_name,
      active_session.session_started_at,
      active_session.session_expires_at
    from public.kiosk_devices kd
    left join public.users creator on creator.id = kd.created_by
    left join lateral (
      select
        driver.name as driver_name,
        us.created_at as session_started_at,
        us.expires_at as session_expires_at
      from public.user_sessions us
      join public.users driver on driver.id = us.user_id
      where us.kiosk_device_id = kd.id
        and us.revoked_at is null
        and us.expires_at > now()
      order by us.created_at desc
      limit 1
    ) active_session on true
  ) device_row;

  return json_build_object('ok', true, 'devices', v_devices);
end;
$$;

create or replace function public.admin_rename_kiosk_device(
  p_session_token text,
  p_device_id uuid,
  p_name text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_name text := left(nullif(trim(coalesce(p_name, '')), ''), 120);
  v_old_name text;
begin
  v_admin_id := public.require_admin(p_session_token);
  if v_name is null then
    return json_build_object('error', 'Nazwa stanowiska jest wymagana');
  end if;

  update public.kiosk_devices
  set name = v_name
  where id = p_device_id
  returning name into v_old_name;

  if not found then
    return json_build_object('error', 'Stanowisko nie istnieje');
  end if;

  update public.user_sessions
  set device_label = left('Kiosk: ' || v_name, 200)
  where kiosk_device_id = p_device_id
    and revoked_at is null;

  insert into public.logs (
    action, category, entity_type, entity_id, actor_user_id, details, metadata
  ) values (
    'kiosk_device_renamed', 'security', 'kiosk_device', p_device_id::text,
    v_admin_id, format('Zmieniono nazwe stanowiska na: %s', v_name),
    jsonb_build_object('device_name', v_name)
  );

  return json_build_object('ok', true, 'device_id', p_device_id, 'device_name', v_name);
end;
$$;

create or replace function public.admin_revoke_kiosk_device(
  p_session_token text,
  p_device_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
  v_name text;
begin
  v_admin_id := public.require_admin(p_session_token);

  update public.kiosk_devices
  set is_active = false
  where id = p_device_id
    and is_active = true
  returning name into v_name;

  if not found then
    if exists (select 1 from public.kiosk_devices where id = p_device_id) then
      return json_build_object('ok', true, 'already_revoked', true);
    end if;
    return json_build_object('error', 'Stanowisko nie istnieje');
  end if;

  update public.user_sessions
  set revoked_at = now()
  where kiosk_device_id = p_device_id
    and revoked_at is null;

  insert into public.logs (
    action, category, entity_type, entity_id, actor_user_id, details, metadata
  ) values (
    'kiosk_device_revoked', 'security', 'kiosk_device', p_device_id::text,
    v_admin_id, format('Odebrano dostep stanowisku: %s', v_name),
    jsonb_build_object('device_name', v_name)
  );

  return json_build_object('ok', true, 'device_id', p_device_id);
end;
$$;

-- Starsze wdrozenia funkcji wyboru kierowcy nie zwracaly stabilnego kodu
-- bledu. Kod pozwala przegladarce usunac uniewazniony klucz i pokazac ekran
-- ponownej aktywacji bez recznego czyszczenia pamieci przegladarki.
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
    return json_build_object('error', 'Stanowisko nie jest aktywne', 'code', 'device_inactive');
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

revoke all on function public.admin_get_kiosk_devices(text) from public;
revoke all on function public.admin_rename_kiosk_device(text, uuid, text) from public;
revoke all on function public.admin_revoke_kiosk_device(text, uuid) from public;
revoke all on function public.get_kiosk_drivers(text) from public;

grant execute on function public.admin_get_kiosk_devices(text) to anon, authenticated;
grant execute on function public.admin_rename_kiosk_device(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_revoke_kiosk_device(text, uuid) to anon, authenticated;
grant execute on function public.get_kiosk_drivers(text) to anon, authenticated;
