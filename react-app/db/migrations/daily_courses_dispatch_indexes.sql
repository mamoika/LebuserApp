-- Cover foreign keys used by course synchronization and journal queries.

create index if not exists clients_route_id_idx on public.clients (route_id)
  where route_id is not null;
create index if not exists entries_route_id_idx on public.entries (route_id)
  where route_id is not null;
create index if not exists entries_laundry_trolley_cycle_id_idx on public.entries (laundry_trolley_cycle_id)
  where laundry_trolley_cycle_id is not null;
create index if not exists trip_events_segment_id_idx on public.trip_events (segment_id)
  where segment_id is not null;
create index if not exists trip_stops_completed_by_user_id_idx on public.trip_stops (completed_by_user_id)
  where completed_by_user_id is not null;
