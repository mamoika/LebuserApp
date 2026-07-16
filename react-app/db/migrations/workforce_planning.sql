-- Daily workforce planning stored as one versioned JSON document per day.
-- The work schedule remains the source of employee availability.

create or replace function public.get_workforce_plan(
  p_session_token text,
  p_work_date date
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_key text;
  v_setting public.app_settings;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data access required' using errcode = '42501';
  end if;
  if p_work_date is null then
    raise exception 'Work date is required' using errcode = '22023';
  end if;

  v_key := 'workforce_plan_' || to_char(p_work_date, 'YYYY-MM-DD');
  select * into v_setting from public.app_settings where key = v_key;

  return json_build_object(
    'ok', true,
    'work_date', to_char(p_work_date, 'YYYY-MM-DD'),
    'plan', coalesce(v_setting.value, '{"assignments":{},"requirements":{}}'::jsonb),
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.admin_save_workforce_plan(
  p_session_token text,
  p_work_date date,
  p_plan jsonb,
  p_expected_updated_at timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_key text;
  v_existing public.app_settings;
  v_saved public.app_settings;
begin
  perform public.require_admin(p_session_token);
  select * into v_admin from public.session_user(p_session_token) limit 1;
  if p_work_date is null then
    raise exception 'Work date is required' using errcode = '22023';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(coalesce(p_plan->'assignments', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_plan->'requirements', '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid workforce plan' using errcode = '22023';
  end if;
  if length(p_plan::text) > 100000 then
    raise exception 'Workforce plan is too large' using errcode = '22023';
  end if;

  v_key := 'workforce_plan_' || to_char(p_work_date, 'YYYY-MM-DD');
  select * into v_existing from public.app_settings where key = v_key for update;

  if v_existing.key is not null
     and (p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at) then
    return json_build_object('error', 'CONCURRENT_MODIFICATION: plan dnia został zmieniony przez innego użytkownika');
  end if;

  if v_existing.key is null then
    insert into public.app_settings (key, value, updated_at)
    values (v_key, p_plan, now())
    on conflict (key) do nothing
    returning * into v_saved;
    if v_saved.key is null then
      raise exception 'CONCURRENT_MODIFICATION: plan dnia został utworzony przez innego użytkownika';
    end if;
  else
    update public.app_settings
    set value = p_plan, updated_at = now()
    where key = v_key
    returning * into v_saved;
  end if;

  return json_build_object(
    'ok', true,
    'work_date', to_char(p_work_date, 'YYYY-MM-DD'),
    'plan', v_saved.value,
    'updated_at', v_saved.updated_at,
    'updated_by', v_admin.name
  );
end;
$$;

grant execute on function public.get_workforce_plan(text, date) to anon, authenticated;
grant execute on function public.admin_save_workforce_plan(text, date, jsonb, timestamptz) to anon, authenticated;
