-- Replace daily workforce plans with one general visual floor plan.

create or replace function public.get_workforce_floor_plan(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_setting public.app_settings;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then raise exception 'Invalid or expired session' using errcode = '28000'; end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;

  select * into v_setting from public.app_settings where key = 'workforce_floor_plan';
  return json_build_object(
    'ok', true,
    'plan', coalesce(v_setting.value, '{"assignments":{},"requirements":{}}'::jsonb),
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.admin_save_workforce_floor_plan(
  p_session_token text,
  p_plan jsonb,
  p_expected_updated_at timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.app_settings;
  v_saved public.app_settings;
begin
  perform public.require_admin(p_session_token);
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(coalesce(p_plan->'assignments', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_plan->'requirements', '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid workforce floor plan' using errcode = '22023';
  end if;

  select * into v_existing from public.app_settings where key = 'workforce_floor_plan' for update;
  if v_existing.key is not null
     and (p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at) then
    return json_build_object('error', 'CONCURRENT_MODIFICATION: plan hali został zmieniony przez innego użytkownika');
  end if;

  if v_existing.key is null then
    insert into public.app_settings (key, value, updated_at)
    values ('workforce_floor_plan', p_plan, now())
    on conflict (key) do nothing returning * into v_saved;
    if v_saved.key is null then
      raise exception 'CONCURRENT_MODIFICATION: plan hali został utworzony przez innego użytkownika';
    end if;
  else
    update public.app_settings set value = p_plan, updated_at = now()
    where key = 'workforce_floor_plan' returning * into v_saved;
  end if;

  return json_build_object('ok', true, 'plan', v_saved.value, 'updated_at', v_saved.updated_at);
end;
$$;

drop function if exists public.get_workforce_plan(text, date);
drop function if exists public.admin_save_workforce_plan(text, date, jsonb, timestamptz);

grant execute on function public.get_workforce_floor_plan(text) to anon, authenticated;
grant execute on function public.admin_save_workforce_floor_plan(text, jsonb, timestamptz) to anon, authenticated;
