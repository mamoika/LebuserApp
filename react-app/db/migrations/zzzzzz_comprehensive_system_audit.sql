-- Centralny audyt zmian biznesowych. Kontekst aktora jest ustawiany przez
-- session_user(), a triggery zapisują wyłącznie pola, które naprawdę się zmieniły.

create index if not exists logs_action_created_idx on public.logs (action, created_at desc);

create or replace function public.session_user(p_session_token text)
returns table(id uuid, username text, name text, role text, routes text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session record;
begin
  select
    s.id as session_id,
    s.user_id,
    s.device_label,
    s.impersonated_by_user_id,
    admin_user.name as impersonator_name,
    admin_user.role as impersonator_role,
    u.username,
    u.name,
    u.role,
    u.routes
  into v_session
  from public.user_sessions s
  join public.users u on u.id = s.user_id
  left join public.users admin_user on admin_user.id = s.impersonated_by_user_id
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if v_session.user_id is null then return; end if;

  perform set_config('app.audit_user_id', coalesce(v_session.impersonated_by_user_id, v_session.user_id)::text, true);
  perform set_config('app.audit_user_name', coalesce(v_session.impersonator_name, v_session.name, ''), true);
  perform set_config('app.audit_user_role', coalesce(v_session.impersonator_role, v_session.role, ''), true);
  perform set_config('app.audit_session_id', v_session.session_id::text, true);
  perform set_config('app.audit_device_label', coalesce(v_session.device_label, ''), true);
  perform set_config('app.audit_impersonated_by_user_id', coalesce(v_session.impersonated_by_user_id::text, ''), true);
  perform set_config('app.audit_effective_user_id', v_session.user_id::text, true);
  perform set_config('app.audit_effective_user_name', coalesce(v_session.name, ''), true);
  perform set_config('app.audit_effective_user_role', coalesce(v_session.role, ''), true);

  update public.user_sessions s
  set last_seen_at = now()
  where s.id = v_session.session_id
    and (s.last_seen_at is null or s.last_seen_at < now() - interval '5 minutes');

  return query select
    v_session.user_id::uuid,
    v_session.username::text,
    v_session.name::text,
    v_session.role::text,
    v_session.routes::text;
end;
$$;

create or replace function private.audit_sanitize(p_table text, p_row jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_row jsonb := coalesce(p_row, '{}'::jsonb) - 'updated_at';
begin
  if p_table = 'users' then
    v_row := v_row - 'password_hash';
  elsif p_table = 'user_sessions' then
    v_row := v_row - 'token_hash' - 'user_agent' - 'last_seen_at';
  elsif p_table = 'app_settings' and coalesce(v_row->>'key', '') ~* '(secret|token|password|api.?key)' then
    v_row := jsonb_set(v_row, '{value}', '"[REDACTED]"'::jsonb, true);
  end if;
  return v_row;
end;
$$;

create or replace function private.audit_table_change()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_old_raw jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  v_new_raw jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  v_old jsonb := private.audit_sanitize(tg_table_name, v_old_raw);
  v_new jsonb := private.audit_sanitize(tg_table_name, v_new_raw);
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_keys text[] := '{}'::text[];
  v_key text;
  v_actor_id uuid;
  v_actor_name text;
  v_actor_role text;
  v_session_id uuid;
  v_device_label text;
  v_entity_id text;
  v_display text;
  v_operation text;
  v_action text;
  v_metadata jsonb;
  v_target_user_id uuid;
  v_password_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    for v_key in
      select key
      from jsonb_object_keys(v_old || v_new) as key
      where v_old->key is distinct from v_new->key
      order by key
    loop
      v_keys := array_append(v_keys, v_key);
      v_before := v_before || jsonb_build_object(v_key, v_old->v_key);
      v_after := v_after || jsonb_build_object(v_key, v_new->v_key);
    end loop;
  elsif tg_op = 'INSERT' then
    v_after := v_new;
    select coalesce(array_agg(key order by key), '{}'::text[]) into v_keys from jsonb_object_keys(v_new) as key;
  else
    v_before := v_old;
    select coalesce(array_agg(key order by key), '{}'::text[]) into v_keys from jsonb_object_keys(v_old) as key;
  end if;

  if tg_table_name = 'users' and tg_op = 'UPDATE' then
    v_password_changed := v_old_raw->'password_hash' is distinct from v_new_raw->'password_hash';
    if v_password_changed then v_keys := array_append(v_keys, 'password'); end if;
  end if;

  if coalesce(array_length(v_keys, 1), 0) = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Wpisy mają już szczegółowy dziennik odbiorów/dostaw. Tutaj zapisujemy tylko
  -- część pralniczą, której dotychczas brakowało.
  if tg_table_name = 'entries' then
    if tg_op = 'UPDATE' and not (v_keys && array[
      'washed', 'washed_at', 'washed_by', 'laundry_status', 'laundry_packed_at',
      'laundry_packed_by', 'laundry_ready_at', 'laundry_trolley_no',
      'laundry_trolley_cycle_id', 'weighed_kg'
    ]) then
      return new;
    elsif tg_op <> 'UPDATE' and not (
      coalesce((coalesce(nullif(v_new_raw, '{}'::jsonb), v_old_raw)->>'washed')::boolean, false)
      or coalesce(nullif(v_new_raw, '{}'::jsonb), v_old_raw)->>'laundry_status' is not null
      or coalesce(nullif(v_new_raw, '{}'::jsonb), v_old_raw)->>'laundry_packed_at' is not null
      or coalesce(nullif(v_new_raw, '{}'::jsonb), v_old_raw)->>'laundry_ready_at' is not null
      or coalesce(nullif(v_new_raw, '{}'::jsonb), v_old_raw)->>'laundry_trolley_cycle_id' is not null
      or coalesce(nullif(v_new_raw, '{}'::jsonb), v_old_raw)->>'weighed_kg' is not null
    ) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
  end if;

  v_actor_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  v_actor_name := nullif(current_setting('app.audit_user_name', true), '');
  v_actor_role := nullif(current_setting('app.audit_user_role', true), '');
  v_session_id := nullif(current_setting('app.audit_session_id', true), '')::uuid;
  v_device_label := nullif(current_setting('app.audit_device_label', true), '');

  -- Zmiany tras wykonywane przez człowieka mają już bogatsze logi domenowe.
  -- Trigger uzupełnia tylko automaty (np. cron uruchamiający zaplanowaną trasę).
  if tg_table_name = 'driver_trips' and v_actor_id is not null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'user_sessions' then
    v_target_user_id := coalesce((v_new_raw->>'user_id')::uuid, (v_old_raw->>'user_id')::uuid);
    if tg_op = 'UPDATE'
      and v_old_raw->'device_label' is distinct from v_new_raw->'device_label'
      and v_old_raw->'revoked_at' is not distinct from v_new_raw->'revoked_at'
    then
      update public.logs
      set device_label = v_new_raw->>'device_label',
          metadata = metadata || jsonb_build_object('device_registered', true)
      where session_id = (v_new_raw->>'id')::uuid
        and action in ('login_success', 'impersonation_started');
      return new;
    end if;
    if v_actor_id is null and v_target_user_id is not null then
      select id, name, role into v_actor_id, v_actor_name, v_actor_role
      from public.users where id = v_target_user_id;
    end if;
    v_session_id := coalesce((v_new_raw->>'id')::uuid, (v_old_raw->>'id')::uuid);
    v_device_label := coalesce(v_new_raw->>'device_label', v_old_raw->>'device_label', v_device_label);
  elsif tg_table_name = 'users' and v_actor_id is null and tg_op = 'INSERT' then
    v_actor_id := (v_new_raw->>'id')::uuid;
    v_actor_name := v_new_raw->>'name';
    v_actor_role := v_new_raw->>'role';
  end if;

  v_actor_name := coalesce(v_actor_name, 'System');
  v_actor_role := coalesce(v_actor_role, 'system');
  v_entity_id := coalesce(v_new->>tg_argv[2], v_old->>tg_argv[2]);
  v_display := case when coalesce(tg_argv[3], '') = '' then null else coalesce(v_new->>tg_argv[3], v_old->>tg_argv[3]) end;
  v_operation := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  v_action := tg_argv[1] || '_' || v_operation;

  if tg_table_name = 'users' then
    if tg_op = 'UPDATE' and v_password_changed and coalesce(array_length(v_keys, 1), 0) = 1 then
      v_action := 'password_changed';
    elsif tg_op = 'UPDATE' and v_keys && array['role', 'routes', 'employee_id'] then
      v_action := 'user_permissions_updated';
    elsif tg_op = 'UPDATE' and v_keys && array['privacy_notice_ack_at', 'privacy_notice_ack_version'] then
      v_action := 'privacy_acknowledged';
    end if;
  elsif tg_table_name = 'user_sessions' then
    if tg_op = 'INSERT' then
      v_action := case when v_new_raw->>'impersonated_by_user_id' is not null then 'impersonation_started' else 'login_success' end;
    elsif tg_op = 'UPDATE' and v_old_raw->>'revoked_at' is null and v_new_raw->>'revoked_at' is not null then
      if v_old_raw->>'impersonated_by_user_id' is not null then
        v_action := 'impersonation_ended';
      elsif nullif(current_setting('app.audit_user_id', true), '') is null
        or nullif(current_setting('app.audit_user_id', true), '') = v_old_raw->>'user_id'
      then
        v_action := 'logout';
      else
        v_action := 'session_revoked';
      end if;
    end if;
  elsif tg_table_name = 'driver_trips' and tg_op = 'UPDATE'
    and v_old_raw->>'status' = 'planned' and v_new_raw->>'status' = 'active'
  then
    v_action := 'trip_auto_started';
  end if;

  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'operation', v_operation,
    'table', tg_table_name,
    'changed_fields', to_jsonb(v_keys),
    'before', nullif(v_before, '{}'::jsonb),
    'after', nullif(v_after, '{}'::jsonb),
    'source', 'database_trigger',
    'password_changed', case when v_password_changed then true else null end,
    'target_user_id', case when v_target_user_id is not null then v_target_user_id else null end,
    'impersonated_by_user_id', nullif(current_setting('app.audit_impersonated_by_user_id', true), '')
  ));

  insert into public.logs (
    user_name, actor_user_id, actor_role, action, category, client_name,
    entity_type, entity_id, details, metadata, session_id, device_label, created_at
  ) values (
    v_actor_name, v_actor_id, v_actor_role, v_action, tg_argv[0], v_display,
    tg_argv[1], v_entity_id, null, v_metadata, v_session_id, v_device_label, now()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.audit_clear_stale_references()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'effective_user_id', nullif(current_setting('app.audit_effective_user_id', true), ''),
    'effective_user_name', nullif(current_setting('app.audit_effective_user_name', true), ''),
    'effective_user_role', nullif(current_setting('app.audit_effective_user_role', true), '')
  ));
  if new.actor_user_id is not null
    and not exists (select 1 from public.users where id = new.actor_user_id)
  then
    new.actor_user_id := null;
  end if;
  if new.session_id is not null
    and not exists (select 1 from public.user_sessions where id = new.session_id)
  then
    new.session_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_clear_stale_references on public.logs;
create trigger audit_logs_clear_stale_references
before insert on public.logs
for each row execute function private.audit_clear_stale_references();

-- Bezpieczne logowanie nieudanych prób logowania. Hasło nigdy nie opuszcza funkcji.
create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
  v_attempted_username text := lower(trim(coalesce(p_username, '')));
begin
  select id, username, name, role, routes, password_hash,
         privacy_notice_ack_at, privacy_notice_ack_version, language
  into v_user from public.users where username = v_attempted_username;

  if v_user.id is null then
    insert into public.logs (user_name, actor_role, action, category, client_name, entity_type, details, metadata)
    values ('Nieznany użytkownik', 'anonymous', 'login_failed', 'security', v_attempted_username, 'user',
      'Nieudana próba logowania', jsonb_build_object('reason', 'unknown_user', 'outcome', 'failed'));
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;
  if v_user.password_hash is null then
    insert into public.logs (user_name, actor_user_id, actor_role, action, category, client_name, entity_type, entity_id, details, metadata)
    values (v_user.name, v_user.id, v_user.role, 'login_failed', 'security', v_user.username, 'user', v_user.id::text,
      'Konto bez ustawionego hasła', jsonb_build_object('reason', 'password_not_set', 'outcome', 'failed'));
    return json_build_object('error', 'Konto nie ma jeszcze ustawionego hasła');
  end if;
  if v_user.password_hash != crypt(p_password, v_user.password_hash) then
    insert into public.logs (user_name, actor_user_id, actor_role, action, category, client_name, entity_type, entity_id, details, metadata)
    values (v_user.name, v_user.id, v_user.role, 'login_failed', 'security', v_user.username, 'user', v_user.id::text,
      'Nieudana próba logowania', jsonb_build_object('reason', 'invalid_password', 'outcome', 'failed'));
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;

  select * into v_session from public.create_user_session(v_user.id) limit 1;
  return json_build_object(
    'ok', true, 'id', v_user.id, 'username', v_user.username, 'name', v_user.name,
    'role', v_user.role, 'routes', v_user.routes, 'language', v_user.language,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_session.session_token, 'session_expires_at', v_session.expires_at
  );
end;
$$;

drop function if exists public.get_logs_page(text, integer, integer);
create or replace function public.get_logs_page(
  p_session_token text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_category text default null,
  p_search text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows json;
begin
  perform public.require_admin(p_session_token);
  select count(*) into v_total
  from public.logs l
  where (v_category is null or l.category = v_category)
    and (
      v_search is null
      or l.user_name ilike '%' || v_search || '%'
      or l.action ilike '%' || v_search || '%'
      or coalesce(l.client_name, '') ilike '%' || v_search || '%'
      or coalesce(l.details, '') ilike '%' || v_search || '%'
      or coalesce(l.entity_type, '') ilike '%' || v_search || '%'
      or coalesce(l.entity_id, '') ilike '%' || v_search || '%'
      or coalesce(l.device_label, '') ilike '%' || v_search || '%'
    );
  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_rows
  from (
    select l.id, l.user_name, l.actor_user_id, l.actor_role, l.action, l.category,
      l.client_name, l.entry_id, l.entity_type, l.entity_id, l.details, l.metadata,
      l.session_id, l.device_label, l.created_at
    from public.logs l
    where (v_category is null or l.category = v_category)
      and (
        v_search is null
        or l.user_name ilike '%' || v_search || '%'
        or l.action ilike '%' || v_search || '%'
        or coalesce(l.client_name, '') ilike '%' || v_search || '%'
        or coalesce(l.details, '') ilike '%' || v_search || '%'
        or coalesce(l.entity_type, '') ilike '%' || v_search || '%'
        or coalesce(l.entity_id, '') ilike '%' || v_search || '%'
        or coalesce(l.device_label, '') ilike '%' || v_search || '%'
      )
    order by l.created_at desc limit v_limit offset v_offset
  ) x;
  return json_build_object('ok', true, 'total', v_total, 'logs', v_rows);
end;
$$;

drop trigger if exists audit_users on public.users;
drop trigger if exists audit_users_change on public.users;
drop trigger if exists audit_users_delete on public.users;
create trigger audit_users_change after insert or update on public.users
for each row execute function private.audit_table_change('security', 'user', 'id', 'name');
create trigger audit_users_delete before delete on public.users
for each row execute function private.audit_table_change('security', 'user', 'id', 'name');
drop trigger if exists audit_user_sessions on public.user_sessions;
drop trigger if exists audit_user_sessions_change on public.user_sessions;
drop trigger if exists audit_user_sessions_delete on public.user_sessions;
create trigger audit_user_sessions_change after insert or update on public.user_sessions
for each row execute function private.audit_table_change('security', 'session', 'id', 'device_label');
create trigger audit_user_sessions_delete before delete on public.user_sessions
for each row execute function private.audit_table_change('security', 'session', 'id', 'device_label');
drop trigger if exists audit_employees on public.employees;
create trigger audit_employees after insert or update or delete on public.employees
for each row execute function private.audit_table_change('schedule', 'employee', 'id', 'name');
drop trigger if exists audit_groups on public.groups;
create trigger audit_groups after insert or update or delete on public.groups
for each row execute function private.audit_table_change('schedule', 'group', 'id', 'name');
drop trigger if exists audit_roles on public.roles;
create trigger audit_roles after insert or update or delete on public.roles
for each row execute function private.audit_table_change('schedule', 'role', 'id', 'name_pl');
drop trigger if exists audit_routes on public.routes;
create trigger audit_routes after insert or update or delete on public.routes
for each row execute function private.audit_table_change('routes', 'route', 'id', 'name');
drop trigger if exists audit_clients on public.clients;
create trigger audit_clients after insert or update or delete on public.clients
for each row execute function private.audit_table_change('routes', 'client', 'id', 'name');
drop trigger if exists audit_schedule_entries on public.schedule_entries;
create trigger audit_schedule_entries after insert or update or delete on public.schedule_entries
for each row execute function private.audit_table_change('schedule', 'schedule_entry', 'id', 'updated_by');
drop trigger if exists audit_timeline_entries on public.timeline_entries;
create trigger audit_timeline_entries after insert or update or delete on public.timeline_entries
for each row execute function private.audit_table_change('schedule', 'timeline_entry', 'id', 'updated_by');
drop trigger if exists audit_cost_settings on public.cost_settings;
create trigger audit_cost_settings after insert or update or delete on public.cost_settings
for each row execute function private.audit_table_change('costs', 'cost_settings', 'month_key', 'month_key');
drop trigger if exists audit_daily_costs on public.daily_costs;
create trigger audit_daily_costs after insert or update or delete on public.daily_costs
for each row execute function private.audit_table_change('costs', 'daily_cost', 'entry_date', 'entry_date');
drop trigger if exists audit_app_settings on public.app_settings;
create trigger audit_app_settings after insert or update or delete on public.app_settings
for each row execute function private.audit_table_change('settings', 'app_setting', 'key', 'key');
drop trigger if exists audit_laundry_trolley_cycles on public.laundry_trolley_cycles;
create trigger audit_laundry_trolley_cycles after insert or update or delete on public.laundry_trolley_cycles
for each row execute function private.audit_table_change('laundry', 'trolley_cycle', 'id', 'client_name');
drop trigger if exists audit_laundry_receipts on public.laundry_receipts;
create trigger audit_laundry_receipts after insert or update or delete on public.laundry_receipts
for each row execute function private.audit_table_change('laundry', 'laundry_receipt', 'id', 'doc_no');
drop trigger if exists audit_entries_laundry on public.entries;
create trigger audit_entries_laundry after insert or update or delete on public.entries
for each row execute function private.audit_table_change('laundry', 'laundry_entry', 'id', 'client_name');
drop trigger if exists audit_driver_trips_system on public.driver_trips;
create trigger audit_driver_trips_system after insert or update or delete on public.driver_trips
for each row execute function private.audit_table_change('routes', 'trip', 'id', 'driver_name');

revoke execute on function private.audit_sanitize(text, jsonb) from public, anon, authenticated;
revoke execute on function private.audit_table_change() from public, anon, authenticated;
revoke execute on function private.audit_clear_stale_references() from public, anon, authenticated;
revoke execute on function public.login_user(text, text) from public;
revoke execute on function public.get_logs_page(text, integer, integer, text, text) from public;
grant execute on function public.login_user(text, text) to anon, authenticated;
grant execute on function public.get_logs_page(text, integer, integer, text, text) to anon, authenticated;
