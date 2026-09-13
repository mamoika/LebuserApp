-- Globalna konfiguracja tras widocznych w konstruktorze planu tygodniowego.
-- Ukrycie trasy nie usuwa jej, nie zmienia przypisań i nie wpływa na widok
-- kierowcy ani katalog „Klienci i Trasy”.

begin;

create or replace function public.get_weekly_route_plan_visibility(
  p_session_token text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_setting public.app_settings;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select * into v_setting
  from public.app_settings
  where key = 'weekly_route_plan_visibility';

  return json_build_object(
    'ok', true,
    'hidden_route_ids', coalesce(v_setting.value->'hidden_route_ids', '[]'::jsonb),
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.admin_save_weekly_route_plan_visibility(
  p_session_token text,
  p_hidden_route_ids jsonb,
  p_expected_updated_at timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.app_settings;
  v_saved public.app_settings;
  v_hidden_route_ids jsonb;
begin
  perform public.require_admin(p_session_token);

  if p_hidden_route_ids is null or jsonb_typeof(p_hidden_route_ids) <> 'array' then
    raise exception 'hidden_route_ids must be an array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hidden_route_ids) item
    where jsonb_typeof(item) <> 'number'
       or (item #>> '{}') !~ '^[0-9]+$'
  ) then
    raise exception 'hidden_route_ids must contain route IDs' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(route_id order by route_id), '[]'::jsonb)
  into v_hidden_route_ids
  from (
    select distinct (item #>> '{}')::integer as route_id
    from jsonb_array_elements(p_hidden_route_ids) item
    join public.routes route on route.id = (item #>> '{}')::integer
  ) valid_routes;

  select * into v_existing
  from public.app_settings
  where key = 'weekly_route_plan_visibility'
  for update;

  if v_existing.key is not null
     and (p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at) then
    return json_build_object(
      'error',
      'CONCURRENT_MODIFICATION: widoczność tras została zmieniona przez innego użytkownika'
    );
  end if;

  if v_existing.key is null then
    insert into public.app_settings (key, value, updated_at)
    values (
      'weekly_route_plan_visibility',
      jsonb_build_object('hidden_route_ids', v_hidden_route_ids),
      now()
    )
    on conflict (key) do nothing
    returning * into v_saved;

    if v_saved.key is null then
      raise exception 'CONCURRENT_MODIFICATION: widoczność tras została utworzona przez innego użytkownika';
    end if;
  else
    update public.app_settings
    set value = jsonb_build_object('hidden_route_ids', v_hidden_route_ids),
        updated_at = now()
    where key = 'weekly_route_plan_visibility'
    returning * into v_saved;
  end if;

  return json_build_object(
    'ok', true,
    'hidden_route_ids', v_saved.value->'hidden_route_ids',
    'updated_at', v_saved.updated_at
  );
end;
$$;

revoke all on function public.get_weekly_route_plan_visibility(text)
  from public, anon, authenticated;
revoke all on function public.admin_save_weekly_route_plan_visibility(text, jsonb, timestamptz)
  from public, anon, authenticated;

grant execute on function public.get_weekly_route_plan_visibility(text)
  to anon, authenticated;
grant execute on function public.admin_save_weekly_route_plan_visibility(text, jsonb, timestamptz)
  to anon, authenticated;

commit;
