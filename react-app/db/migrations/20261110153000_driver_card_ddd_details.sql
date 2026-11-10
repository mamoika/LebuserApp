-- Udostępnia bezpieczne podsumowania archiwalnych odczytów DDD w Dyspozytorni.

begin;

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
    select e.id as employee_id, e.name, e.driver_card_number as card_number
    from public.employees e
    where e.active = true and e.driver_card_required = true
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
      i.signatures_total,
      i.summary - 'card_number' - 'sha256' as summary
    from public.driver_card_ddd_imports i
    join public.employees e on e.id = i.employee_id
    order by i.imported_at desc
    limit 30
  ) import_row;

  return json_build_object('ok', true, 'drivers', v_drivers, 'imports', v_imports);
end;
$$;

revoke all on function public.get_dispatch_ddd_context(text) from public, anon, authenticated;
grant execute on function public.get_dispatch_ddd_context(text) to anon, authenticated;

commit;
