create index if not exists kiosk_devices_created_by_idx
  on public.kiosk_devices(created_by)
  where created_by is not null;
