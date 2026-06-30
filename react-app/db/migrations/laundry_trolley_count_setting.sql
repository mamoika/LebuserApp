-- ============================================================
--  Pralnia: edytowalna liczba wózków.
--
--  Ustawienie jest zapisane w public.app_settings:
--    key   = 'laundry_trolley_count'
--    value = liczba, domyślnie 25
--
--  URUCHOM w Supabase -> SQL Editor po laundry_workflow_rpc.sql.
-- ============================================================

insert into public.app_settings (key, value, updated_at)
values ('laundry_trolley_count', '25'::jsonb, now())
on conflict (key) do nothing;

create or replace function public.get_laundry_workflow(
  p_session_token text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trolleys json;
  v_trolley_count integer := 25;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver') then
    raise exception 'Admin data session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_trolleys
  from (
    select *
    from public.laundry_trolley_cycles
    where returned_at is null
       or packed_at >= now() - interval '30 days'
    order by returned_at nulls first, packed_at desc
    limit 300
  ) x;

  begin
    select case
      when jsonb_typeof(value) = 'number' then value::text::integer
      when jsonb_typeof(value) = 'string' and trim(both '"' from value::text) ~ '^[0-9]+$'
        then trim(both '"' from value::text)::integer
      else 25
    end
    into v_trolley_count
    from public.app_settings
    where key = 'laundry_trolley_count';
  exception
    when others then
      v_trolley_count := 25;
  end;

  v_trolley_count := greatest(1, least(99, coalesce(v_trolley_count, 25)));

  return json_build_object(
    'ok', true,
    'trolleys', v_trolleys,
    'trolley_count', v_trolley_count
  );
end;
$$;

grant execute on function public.get_laundry_workflow(text) to anon, authenticated;
