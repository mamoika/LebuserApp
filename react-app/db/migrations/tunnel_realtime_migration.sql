-- ============================================================
--  Tunnel Gateway live status and event stream.
--
--  Gateway writes with the Supabase service role key.
--  Browser clients read through Supabase Realtime.
-- ============================================================

create table if not exists public.tunnel_gateway_status (
  gateway_id text primary key,
  connected boolean not null default false,
  dry_run boolean not null default true,
  transport text not null default 'unknown',
  port_name text,
  last_error text,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tunnel_events (
  id uuid primary key default gen_random_uuid(),
  gateway_id text not null,
  event_type text not null,
  command_id text,
  bag_id text,
  hotel_name text,
  program_number integer,
  track_number integer,
  accepted boolean,
  dry_run boolean,
  transport text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tunnel_events_created_at_idx on public.tunnel_events (created_at desc);
create index if not exists tunnel_events_gateway_id_idx on public.tunnel_events (gateway_id, created_at desc);

alter table public.tunnel_gateway_status enable row level security;
alter table public.tunnel_events enable row level security;

drop policy if exists "tunnel status read" on public.tunnel_gateway_status;
drop policy if exists "tunnel status service write" on public.tunnel_gateway_status;
drop policy if exists "tunnel events read" on public.tunnel_events;
drop policy if exists "tunnel events service write" on public.tunnel_events;

create policy "tunnel status read" on public.tunnel_gateway_status
  for select to anon, authenticated
  using (true);

create policy "tunnel status service write" on public.tunnel_gateway_status
  for all to service_role
  using (true)
  with check (true);

create policy "tunnel events read" on public.tunnel_events
  for select to anon, authenticated
  using (true);

create policy "tunnel events service write" on public.tunnel_events
  for all to service_role
  using (true)
  with check (true);

grant select on public.tunnel_gateway_status to anon, authenticated;
grant select on public.tunnel_events to anon, authenticated;
grant all on public.tunnel_gateway_status to service_role;
grant all on public.tunnel_events to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'tunnel_gateway_status'
     ) then
    alter publication supabase_realtime add table public.tunnel_gateway_status;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'tunnel_events'
     ) then
    alter publication supabase_realtime add table public.tunnel_events;
  end if;
end $$;
