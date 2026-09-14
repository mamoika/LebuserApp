begin;

-- 1. Aktualizacja get_laundry_workflow: wzbogacenie każdego cyklu o stan dostawy,
--    dzięki czemu interfejs zna status nawet dla wpisów starszych niż 14-dniowy cache klienta.
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

  if v_user.role not in ('admin', 'admin_viewer', 'admin_viewer_driver', 'driver', 'tunnel', 'packer') then
    raise exception 'Admin data session required' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_trolleys
  from (
    select
      c.*,
      coalesce((
        select bool_or(e.delivered_at is not null or coalesce(e.delivered, false) or coalesce(e.done, false))
        from public.entries e
        where e.id = any(c.entry_ids) and e.deleted_at is null
      ), false) as is_delivered,
      coalesce((
        select bool_or(e.picked_at is not null or e.delivered_at is not null or coalesce(e.delivered, false) or coalesce(e.done, false))
        from public.entries e
        where e.id = any(c.entry_ids) and e.deleted_at is null
      ), false) as is_issued_to_driver,
      (
        select max(e.delivered_at)
        from public.entries e
        where e.id = any(c.entry_ids) and e.deleted_at is null
      ) as entry_delivered_at,
      (
        select string_agg(distinct e.picked_by, ', ')
        from public.entries e
        where e.id = any(c.entry_ids) and e.deleted_at is null and e.picked_by is not null and trim(e.picked_by) <> ''
      ) as driver_name
    from public.laundry_trolley_cycles c
    where c.returned_at is null
       or c.packed_at >= now() - interval '30 days'
    order by c.returned_at nulls first, c.packed_at desc
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

-- 2. Aktualizacja admin_delete_laundry_trolley: dodanie flagi p_force (domyślnie false).
--    Dla Admina z p_force = true pozwala usunąć archiwalny/testowy cykl bez blokady powiązania z trasą.
drop function if exists public.admin_delete_laundry_trolley(text, uuid);

create or replace function public.admin_delete_laundry_trolley(
  p_session_token text,
  p_cycle_id uuid,
  p_force boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_cycle public.laundry_trolley_cycles;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid session' using errcode = '28000';
  end if;
  if v_user.role not in ('admin') then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  select * into v_cycle from public.laundry_trolley_cycles where id = p_cycle_id;
  if v_cycle.id is null then
    return json_build_object('error', 'Cykl nie został znaleziony');
  end if;

  if not coalesce(p_force, false) and exists (
    select 1
    from public.entries e
    where e.id = any(v_cycle.entry_ids)
      and e.deleted_at is null
      and (
        e.picked_at is not null
        or e.delivered_at is not null
        or coalesce(e.delivered, false)
        or coalesce(e.done, false)
      )
  ) then
    return json_build_object(
      'error', 'Nie można usunąć wpisu po wydaniu kierowcy lub dostawie. Najpierw cofnij odbiór/dostawę na trasie.',
      'can_force', true
    );
  end if;

  update public.entries
  set laundry_trolley_cycle_id = null
  where laundry_trolley_cycle_id = p_cycle_id;

  delete from public.laundry_trolley_cycles where id = p_cycle_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_laundry_trolley(text, uuid, boolean) to anon, authenticated;

-- 3. Automatyczne domknięcie wiszących starych cykli bez wózka (trolley_no = 'brak'),
--    które nie mają ustawionego returned_at, aby nie blokowały licznika wózków:
update public.laundry_trolley_cycles
set returned_at = coalesce(returned_at, packed_at, now()),
    status = 'returned',
    updated_at = now()
where lower(trolley_no) = 'brak'
  and returned_at is null;

commit;
