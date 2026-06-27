-- ============================================================
--  Tunnel bags: registry + lifecycle of laundry bags through
--  the wash tunnel.
--
--  Written by the station gateway (service role key).
--  Browser clients (web Tunnel section) read through Realtime.
-- ============================================================

create table if not exists public.tunnel_bags (
  id uuid primary key default gen_random_uuid(),
  gateway_id text not null default 'main-tunnel',
  code text not null,                         -- scannable bag code
  hotel_name text,
  client_id uuid,                             -- optional link to public.clients
  program_number integer,
  track_number integer,
  status text not null default 'queued',      -- queued|entry|wash|rinse|dry|pack|done|error|cancelled
  stage_index integer not null default 0,     -- 0..4 -> entry..pack
  command_id text,                            -- last PLC command id
  last_message text,
  dry_run boolean,
  requested_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  done_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists tunnel_bags_status_idx on public.tunnel_bags (status, created_at desc);
create index if not exists tunnel_bags_gateway_idx on public.tunnel_bags (gateway_id, created_at desc);
create index if not exists tunnel_bags_code_idx on public.tunnel_bags (code);

alter table public.tunnel_bags enable row level security;

drop policy if exists "tunnel bags read" on public.tunnel_bags;
drop policy if exists "tunnel bags service write" on public.tunnel_bags;

create policy "tunnel bags read" on public.tunnel_bags
  for select to anon, authenticated
  using (true);

create policy "tunnel bags service write" on public.tunnel_bags
  for all to service_role
  using (true)
  with check (true);

grant select on public.tunnel_bags to anon, authenticated;
grant all on public.tunnel_bags to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'tunnel_bags'
     ) then
    alter publication supabase_realtime add table public.tunnel_bags;
  end if;
end $$;
