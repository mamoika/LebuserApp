-- Project work-time verification events into the immutable course journal.

create or replace function public.trip_capture_work_time_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report public.work_time_reports;
  v_event_type text;
begin
  select * into v_report from public.work_time_reports where id = new.report_id;
  if v_report.source_trip_id is null then return new; end if;

  v_event_type := case new.event_type
    when 'submitted' then 'hours_submitted'
    when 'approved' then 'hours_approved'
    when 'rejected' then 'hours_rejected'
    else 'hours_updated'
  end;

  insert into public.trip_events (
    trip_id, event_type, actor_user_id, actor_name, details, data, created_at
  ) values (
    v_report.source_trip_id,
    v_event_type,
    new.actor_user_id,
    new.actor_name,
    case new.event_type
      when 'submitted' then 'Zgłoszono czas pracy'
      when 'approved' then 'Zatwierdzono czas pracy'
      when 'rejected' then 'Odrzucono czas pracy'
      else 'Zmieniono zgłoszenie czasu pracy'
    end,
    jsonb_build_object(
      'start', new.work_start,
      'end', new.work_end,
      'minutes', new.work_minutes,
      'note', new.note
    ),
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists trip_capture_work_time_event on public.work_time_report_events;
create trigger trip_capture_work_time_event
after insert on public.work_time_report_events
for each row execute function public.trip_capture_work_time_event_trigger();

insert into public.trip_events (
  trip_id, event_type, actor_user_id, actor_name, details, data, created_at
)
select
  report.source_trip_id,
  case event.event_type
    when 'submitted' then 'hours_submitted'
    when 'approved' then 'hours_approved'
    when 'rejected' then 'hours_rejected'
    else 'hours_updated'
  end,
  event.actor_user_id,
  event.actor_name,
  case event.event_type
    when 'submitted' then 'Zgłoszono czas pracy'
    when 'approved' then 'Zatwierdzono czas pracy'
    when 'rejected' then 'Odrzucono czas pracy'
    else 'Zmieniono zgłoszenie czasu pracy'
  end,
  jsonb_build_object('start', event.work_start, 'end', event.work_end, 'minutes', event.work_minutes, 'note', event.note),
  event.created_at
from public.work_time_report_events event
join public.work_time_reports report on report.id = event.report_id
where report.source_trip_id is not null
  and not exists (
    select 1 from public.trip_events existing
    where existing.trip_id = report.source_trip_id
      and existing.created_at = event.created_at
      and existing.event_type = case event.event_type
        when 'submitted' then 'hours_submitted'
        when 'approved' then 'hours_approved'
        when 'rejected' then 'hours_rejected'
        else 'hours_updated'
      end
  );

revoke all on function public.trip_capture_work_time_event_trigger() from public, anon, authenticated;
