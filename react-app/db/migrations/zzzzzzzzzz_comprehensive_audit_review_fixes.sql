-- Poprawki po niezależnym review: prawdziwy aktor impersonacji, agregacja
-- błędnych logowań, serwerowy fallback wpisów/tras i niezmienny log merge.

create or replace function public.session_user(p_session_token text)
returns table(id uuid, username text, name text, role text, routes text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session record;
begin
  select s.id as session_id, s.user_id, s.device_label, s.impersonated_by_user_id,
    u.username, u.name, u.role, u.routes,
    admin_user.name as impersonator_name, admin_user.role as impersonator_role
  into v_session
  from public.user_sessions s
  join public.users u on u.id = s.user_id
  left join public.users admin_user on admin_user.id = s.impersonated_by_user_id
  where s.token_hash = public.session_hash(p_session_token)
    and s.revoked_at is null and s.expires_at > now()
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
  update public.user_sessions set last_seen_at = now()
  where user_sessions.id = v_session.session_id
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
  return query select v_session.user_id::uuid, v_session.username::text,
    v_session.name::text, v_session.role::text, v_session.routes::text;
end;
$$;

create or replace function private.audit_login_failure(
  p_actor_user_id uuid,
  p_user_name text,
  p_actor_role text,
  p_attempted_username text,
  p_entity_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_log_id public.logs.id%type;
  v_username text := left(coalesce(p_attempted_username, ''), 160);
begin
  perform pg_advisory_xact_lock(hashtextextended('login_failure:' || coalesce(p_entity_id, 'unknown'), 0));
  delete from public.logs where action = 'login_failed' and created_at < now() - interval '90 days';
  select id into v_log_id
  from public.logs
  where action = 'login_failed'
    and created_at >= now() - interval '5 minutes'
    and (
      (p_entity_id is not null and entity_id = p_entity_id)
      or (p_entity_id is null and entity_id is null and metadata->>'reason' = 'unknown_user')
    )
  order by created_at desc limit 1 for update;

  if v_log_id is not null then
    update public.logs
    set created_at = now(), client_name = v_username,
      metadata = metadata || jsonb_build_object(
        'attempts', coalesce((metadata->>'attempts')::integer, 1) + 1,
        'last_attempt_at', now(), 'last_attempted_username', v_username
      )
    where id = v_log_id;
  else
    insert into public.logs (
      user_name, actor_user_id, actor_role, action, category, client_name,
      entity_type, entity_id, details, metadata
    ) values (
      left(coalesce(p_user_name, 'Nieznany użytkownik'), 160), p_actor_user_id,
      left(coalesce(p_actor_role, 'anonymous'), 80), 'login_failed', 'security',
      v_username, 'user', p_entity_id, 'Nieudana próba logowania',
      jsonb_build_object('reason', p_reason, 'outcome', 'failed', 'attempts', 1)
    );
  end if;
end;
$$;

create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
  v_attempted_username text := left(lower(trim(coalesce(p_username, ''))), 160);
begin
  select id, username, name, role, routes, password_hash,
    privacy_notice_ack_at, privacy_notice_ack_version, language
  into v_user from public.users where username = v_attempted_username;
  if v_user.id is null then
    perform private.audit_login_failure(null, 'Nieznany użytkownik', 'anonymous', v_attempted_username, null, 'unknown_user');
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;
  if v_user.password_hash is null then
    perform private.audit_login_failure(v_user.id, v_user.name, v_user.role, v_user.username, v_user.id::text, 'password_not_set');
    return json_build_object('error', 'Konto nie ma jeszcze ustawionego hasła');
  end if;
  if v_user.password_hash != crypt(p_password, v_user.password_hash) then
    perform private.audit_login_failure(v_user.id, v_user.name, v_user.role, v_user.username, v_user.id::text, 'invalid_password');
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

create or replace function public.insert_log(
  p_session_token text,
  p_action text,
  p_client_name text default null,
  p_entry_id text default null,
  p_details text default null,
  p_category text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
  v_category text;
  v_entity_type text;
  v_entity_id text;
  v_fallback_id public.logs.id%type;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode='28000'; end if;
  if nullif(trim(coalesce(p_action,'')),'') is null then return json_build_object('error','Brak akcji logu'); end if;
  select s.id,s.device_label into v_session from public.user_sessions s
  where s.token_hash=public.session_hash(p_session_token) and s.revoked_at is null and s.expires_at>now() limit 1;
  v_category := coalesce(nullif(trim(coalesce(p_category,'')),''),
    case when p_action like 'trip_%' then 'routes' when p_entry_id is not null then 'entries' else 'general' end);
  v_entity_type := coalesce(nullif(trim(coalesce(p_entity_type,'')),''),
    case when p_entry_id is not null then 'entry' when p_action like 'trip_%' then 'trip'
      when p_client_name is not null then 'client' else 'activity' end);
  v_entity_id := coalesce(nullif(trim(coalesce(p_entity_id,'')),''),nullif(trim(coalesce(p_entry_id,'')),''));

  if v_entity_id is not null then
    select id into v_fallback_id from public.logs
    where actor_user_id=nullif(current_setting('app.audit_user_id',true),'')::uuid
      and entity_id=v_entity_id
      and metadata->>'source'='server_fallback'
      and created_at>=now()-interval '45 seconds'
      and not coalesce((metadata->>'client_log_enriched')::boolean,false)
    order by created_at desc limit 1 for update;
  end if;
  if v_fallback_id is not null then
    update public.logs set
      action=trim(p_action), category=v_category,
      client_name=coalesce(nullif(trim(coalesce(p_client_name,'')),''),client_name),
      entry_id=coalesce(nullif(trim(coalesce(p_entry_id,'')),''),entry_id),
      entity_type=v_entity_type,
      details=coalesce(nullif(trim(coalesce(p_details,'')),''),details),
      metadata=metadata || coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('client_log_enriched',true),
      session_id=coalesce(session_id,v_session.id), device_label=coalesce(device_label,v_session.device_label)
    where id=v_fallback_id;
    return json_build_object('ok',true,'enriched',true);
  end if;

  insert into public.logs (
    user_name,actor_user_id,actor_role,action,category,client_name,entry_id,
    entity_type,entity_id,details,metadata,session_id,device_label,created_at
  ) values (
    current_setting('app.audit_user_name',true),nullif(current_setting('app.audit_user_id',true),'')::uuid,
    current_setting('app.audit_user_role',true),trim(p_action),v_category,
    nullif(trim(coalesce(p_client_name,'')),''),nullif(trim(coalesce(p_entry_id,'')),''),
    v_entity_type,v_entity_id,nullif(trim(coalesce(p_details,'')),''),coalesce(p_metadata,'{}'::jsonb),
    v_session.id,v_session.device_label,now()
  );
  return json_build_object('ok',true);
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
  if new.actor_user_id is not null and not exists (select 1 from public.users where id=new.actor_user_id) then
    new.actor_user_id := null;
  end if;
  if new.session_id is not null and not exists (select 1 from public.user_sessions where id=new.session_id) then
    new.session_id := null;
  end if;
  return new;
end;
$$;

create or replace function private.audit_domain_fallback()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_old jsonb := private.audit_sanitize(tg_table_name, case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end);
  v_new jsonb := private.audit_sanitize(tg_table_name, case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end);
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_keys text[] := '{}'::text[];
  v_key text;
  v_operation text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  v_entity_id text;
  v_category text := tg_argv[0];
  v_entity_type text := tg_argv[1];
  v_action text;
begin
  if tg_op = 'UPDATE' then
    for v_key in select key from jsonb_object_keys(v_old || v_new) as key
      where v_old->key is distinct from v_new->key order by key
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
  if coalesce(array_length(v_keys, 1), 0) = 0 then return case when tg_op='DELETE' then old else new end; end if;

  if tg_table_name = 'entries' and v_keys && array[
    'washed','washed_at','washed_by','laundry_status','laundry_packed_at',
    'laundry_packed_by','laundry_ready_at','laundry_trolley_no',
    'laundry_trolley_cycle_id','weighed_kg'
  ] then
    v_category := 'laundry';
    v_entity_type := 'laundry_entry';
  end if;
  v_entity_id := coalesce(v_new->>tg_argv[2], v_old->>tg_argv[2]);
  v_action := v_entity_type || '_' || v_operation;
  if tg_table_name='driver_trips' and tg_op='UPDATE'
    and v_old->>'status'='planned' and v_new->>'status'='active'
    and nullif(current_setting('app.audit_user_id', true), '') is null
  then v_action := 'trip_auto_started'; end if;

  insert into public.logs (
    user_name, actor_user_id, actor_role, action, category, client_name,
    entity_type, entity_id, metadata, session_id, device_label
  ) values (
    coalesce(nullif(current_setting('app.audit_user_name', true), ''), 'System'),
    nullif(current_setting('app.audit_user_id', true), '')::uuid,
    coalesce(nullif(current_setting('app.audit_user_role', true), ''), 'system'),
    v_action, v_category, coalesce(v_new->>tg_argv[3], v_old->>tg_argv[3]),
    v_entity_type, v_entity_id,
    jsonb_strip_nulls(jsonb_build_object(
      'operation', v_operation, 'table', tg_table_name,
      'changed_fields', to_jsonb(v_keys), 'before', nullif(v_before,'{}'::jsonb),
      'after', nullif(v_after,'{}'::jsonb), 'source', 'server_fallback'
    )),
    nullif(current_setting('app.audit_session_id', true), '')::uuid,
    nullif(current_setting('app.audit_device_label', true), '')
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists audit_entries_laundry on public.entries;
drop trigger if exists audit_entries_server_fallback on public.entries;
create trigger audit_entries_server_fallback after insert or update or delete on public.entries
for each row execute function private.audit_domain_fallback('entries','entry','id','client_name');
drop trigger if exists audit_driver_trips_system on public.driver_trips;
drop trigger if exists audit_driver_trips_server_fallback on public.driver_trips;
create trigger audit_driver_trips_server_fallback after insert or update or delete on public.driver_trips
for each row execute function private.audit_domain_fallback('routes','trip','id','driver_name');

create or replace function public.admin_merge_clients(
  p_session_token text, p_source_client_id uuid, p_target_client_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_source public.clients%rowtype;
  v_target public.clients%rowtype;
  v_entries_count integer := 0;
  v_trips_count integer := 0;
begin
  perform public.require_admin(p_session_token);
  if p_source_client_id = p_target_client_id then return json_build_object('error','Wybierz dwóch różnych klientów'); end if;
  select * into v_source from public.clients where id=p_source_client_id for update;
  select * into v_target from public.clients where id=p_target_client_id for update;
  if v_source.id is null then return json_build_object('error','Nie znaleziono klienta źródłowego'); end if;
  if v_target.id is null then return json_build_object('error','Nie znaleziono klienta docelowego'); end if;
  update public.entries set client_name=v_target.name, route_id=v_target.route_id where client_name=v_source.name;
  get diagnostics v_entries_count = row_count;
  update public.driver_trips dt set extra_clients=(
    select coalesce(jsonb_agg(distinct case when x.value=v_source.name then v_target.name else x.value end)::text,'[]')
    from jsonb_array_elements_text(coalesce(nullif(dt.extra_clients,''),'[]')::jsonb) as x(value)
  ) where coalesce(nullif(dt.extra_clients,''),'[]')::jsonb ? v_source.name;
  get diagnostics v_trips_count = row_count;
  update public.clients set note=case when nullif(note,'') is null then v_source.note else note end where id=v_target.id;
  delete from public.clients where id=v_source.id;
  insert into public.logs (
    user_name, actor_user_id, actor_role, action, category, client_name,
    entity_type, entity_id, details, metadata, session_id, device_label
  ) values (
    current_setting('app.audit_user_name', true), nullif(current_setting('app.audit_user_id', true),'')::uuid,
    current_setting('app.audit_user_role', true), 'client_merged', 'routes', v_target.name,
    'client_merge', v_target.id::text, 'Scalono duplikat klienta',
    jsonb_build_object('source_id',v_source.id,'source_name',v_source.name,'target_id',v_target.id,
      'target_name',v_target.name,'entries',v_entries_count,'trips',v_trips_count),
    nullif(current_setting('app.audit_session_id', true),'')::uuid,
    nullif(current_setting('app.audit_device_label', true),'')
  );
  return json_build_object('ok',true,'source',v_source.name,'target',v_target.name,
    'entries',v_entries_count,'trips',v_trips_count,'logs',0);
end;
$$;

revoke execute on function private.audit_login_failure(uuid,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function private.audit_domain_fallback() from public, anon, authenticated;
revoke execute on function public.insert_log(text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.insert_log(text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;
