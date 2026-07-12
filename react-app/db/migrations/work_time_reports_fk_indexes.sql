-- Indeksy dla kluczy obcych zgłoszeń czasu wskazanych przez Supabase Advisor.
create index if not exists work_time_reports_source_trip_idx
  on public.work_time_reports (source_trip_id)
  where source_trip_id is not null;

create index if not exists work_time_reports_approved_by_idx
  on public.work_time_reports (approved_by_user_id)
  where approved_by_user_id is not null;

