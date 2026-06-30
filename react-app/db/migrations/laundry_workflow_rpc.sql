-- ============================================================
--  Pralnia: pranie, pakowanie i obieg wózków.
--
--  Dodaje serwerowy stan potrzebny do widoku /wash:
--   - wpisy entries dostają status pralni i przypisany wózek,
--   - wózek ma aktywny cykl aż do oznaczenia "wrócił",
--   - kierowca może widzieć czyste pranie jako gotowe dopiero po pakowaniu.
--
--  URUCHOM w Supabase -> SQL Editor. Idempotentne.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.entries add column if not exists laundry_status text;
alter table public.entries add column if not exists laundry_packed_at timestamptz;
alter table public.entries add column if not exists laundry_packed_by text;
alter table public.entries add column if not exists laundry_ready_at timestamptz;
alter table public.entries add column if not exists laundry_trolley_no text;
alter table public.entries add column if not exists laundry_trolley_cycle_id uuid;

update public.entries
set laundry_status = case
  when coalesce(done, false) then 'released'
  when laundry_ready_at is not null or laundry_packed_at is not null then 'packed'
  when coalesce(washed, false) then 'washed'
  else 'pending'
end
where laundry_status is null;

alter table public.entries alter column laundry_status set default 'pending';

create table if not exists public.laundry_trolley_cycles (
  id uuid primary key default gen_random_uuid(),
  trolley_no text not null,
  client_name text not null,
  entry_ids text[] not null default array[]::text[],
  total_kg numeric not null default 0,
  status text not null default 'packed', -- packed|released|at_client|returned
  packed_by text,
  packed_at timestamptz not null default now(),
  released_by text,
  released_at timestamptz,
  delivered_by text,
  delivered_at timestamptz,
  returned_by text,
  returned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laundry_trolley_cycles_client_idx
  on public.laundry_trolley_cycles (client_name, packed_at desc);

create index if not exists laundry_trolley_cycles_status_idx
  on public.laundry_trolley_cycles (status, packed_at desc);

create unique index if not exists laundry_trolley_cycles_active_no_idx
  on public.laundry_trolley_cycles (lower(trolley_no))
  where returned_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'entries_laundry_trolley_cycle_fk'
  ) then
    alter table public.entries
      add constraint entries_laundry_trolley_cycle_fk
      foreign key (laundry_trolley_cycle_id)
      references public.laundry_trolley_cycles(id)
      on delete set null;
  end if;
end $$;

alter table public.laundry_trolley_cycles enable row level security;

drop policy if exists "laundry trolley cycles read" on public.laundry_trolley_cycles;
create policy "laundry trolley cycles read"
  on public.laundry_trolley_cycles for select to anon, authenticated
  using (true);

grant select on public.laundry_trolley_cycles to anon, authenticated;
revoke insert, update, delete on public.laundry_trolley_cycles from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'laundry_trolley_cycles'
     ) then
    alter publication supabase_realtime add table public.laundry_trolley_cycles;
  end if;
end $$;

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

  return json_build_object('ok', true, 'trolleys', v_trolleys);
end;
$$;

create or replace function public.admin_mark_laundry_washed(
  p_session_token text,
  p_ids text[],
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_count integer;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak wpisów do oznaczenia');
  end if;

  update public.entries
  set washed = true,
      washed_at = now(),
      washed_by = coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name),
      laundry_status = case
        when laundry_ready_at is not null or laundry_packed_at is not null then 'packed'
        else 'washed'
      end
  where id = any(p_ids)
    and deleted_at is null
    and coalesce(done, false) = false;

  get diagnostics v_count = row_count;

  return json_build_object('ok', true, 'affected', v_count);
end;
$$;

create or replace function public.admin_pack_laundry_trolley(
  p_session_token text,
  p_ids text[],
  p_trolley_no text,
  p_by text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_trolley_no text := nullif(trim(coalesce(p_trolley_no, '')), '');
  v_client_name text;
  v_client_count integer;
  v_all_washed boolean;
  v_any_done boolean;
  v_entry_ids text[];
  v_existing public.laundry_trolley_cycles;
  v_cycle public.laundry_trolley_cycles;
  v_all_cycle_ids text[];
  v_total_kg numeric;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;

  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return json_build_object('error', 'Brak wpisów do spakowania');
  end if;

  if v_trolley_no is null then
    return json_build_object('error', 'Podaj numer wózka');
  end if;

  select
    min(e.client_name),
    count(distinct e.client_name),
    bool_and(coalesce(e.washed, false)),
    bool_or(coalesce(e.done, false)),
    array_agg(e.id order by e.id)
  into v_client_name, v_client_count, v_all_washed, v_any_done, v_entry_ids
  from public.entries e
  where e.id = any(p_ids)
    and e.deleted_at is null;

  if v_entry_ids is null or array_length(v_entry_ids, 1) is null then
    return json_build_object('error', 'Nie znaleziono wpisów');
  end if;

  if v_client_count <> 1 then
    return json_build_object('error', 'Jeden wózek można przypisać tylko do jednego klienta');
  end if;

  if not coalesce(v_all_washed, false) then
    return json_build_object('error', 'Najpierw oznacz pranie jako wyprane');
  end if;

  if coalesce(v_any_done, false) then
    return json_build_object('error', 'Tego prania nie można spakować, bo kierowca już je odebrał');
  end if;

  select *
  into v_existing
  from public.laundry_trolley_cycles
  where lower(trolley_no) = lower(v_trolley_no)
    and returned_at is null
  limit 1;

  if v_existing.id is not null and v_existing.client_name <> v_client_name then
    return json_build_object(
      'error',
      format('Wózek %s jest już przypisany do: %s', v_trolley_no, v_existing.client_name)
    );
  end if;

  if v_existing.id is null then
    insert into public.laundry_trolley_cycles (
      trolley_no, client_name, entry_ids, total_kg, status, packed_by
    )
    select
      v_trolley_no,
      v_client_name,
      v_entry_ids,
      coalesce(sum(coalesce(weight, 0)), 0),
      'packed',
      coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name)
    from public.entries
    where id = any(v_entry_ids)
    returning * into v_cycle;
  else
    v_all_cycle_ids := array(
      select distinct x
      from unnest(coalesce(v_existing.entry_ids, array[]::text[]) || v_entry_ids) as x
      order by x
    );

    select coalesce(sum(coalesce(weight, 0)), 0)
    into v_total_kg
    from public.entries
    where id = any(v_all_cycle_ids);

    update public.laundry_trolley_cycles
    set entry_ids = v_all_cycle_ids,
        total_kg = v_total_kg,
        status = 'packed',
        packed_by = coalesce(packed_by, coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name)),
        updated_at = now()
    where id = v_existing.id
    returning * into v_cycle;
  end if;

  update public.entries
  set laundry_status = 'packed',
      laundry_packed_at = now(),
      laundry_packed_by = coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name),
      laundry_ready_at = coalesce(laundry_ready_at, now()),
      laundry_trolley_no = v_trolley_no,
      laundry_trolley_cycle_id = v_cycle.id
  where id = any(v_entry_ids)
    and deleted_at is null;

  return json_build_object('ok', true, 'trolley', row_to_json(v_cycle));
end;
$$;

create or replace function public.admin_return_laundry_trolley(
  p_session_token text,
  p_cycle_id uuid,
  p_by text default null
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
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_user.role not in ('admin', 'admin_viewer_driver') then
    raise exception 'Laundry manager session required' using errcode = '42501';
  end if;

  update public.laundry_trolley_cycles
  set status = 'returned',
      returned_by = coalesce(nullif(trim(coalesce(p_by, '')), ''), v_user.name),
      returned_at = now(),
      updated_at = now()
  where id = p_cycle_id
    and returned_at is null
  returning * into v_cycle;

  if v_cycle.id is null then
    return json_build_object('error', 'Nie znaleziono aktywnego wózka');
  end if;

  update public.entries
  set laundry_status = 'returned'
  where id = any(v_cycle.entry_ids);

  return json_build_object('ok', true, 'trolley', row_to_json(v_cycle));
end;
$$;

grant execute on function public.get_laundry_workflow(text) to anon, authenticated;
grant execute on function public.admin_mark_laundry_washed(text, text[], text) to anon, authenticated;
grant execute on function public.admin_pack_laundry_trolley(text, text[], text, text) to anon, authenticated;
grant execute on function public.admin_return_laundry_trolley(text, uuid, text) to anon, authenticated;
