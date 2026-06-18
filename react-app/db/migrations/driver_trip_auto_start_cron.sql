-- =====================================================================
-- Serwerowy auto-start zaplanowanych tras.
-- ---------------------------------------------------------------------
-- Front-end nadal wywołuje auto_start_due_trips przy wejściu do widoku tras,
-- ale to zadanie działa niezależnie od użytkowników: baza co minutę promuje
-- trasy planned -> active, jeśli minął planned_start.
-- =====================================================================

create or replace function public.auto_start_due_trips_system()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_affected integer;
begin
  update public.driver_trips
  set status = 'active',
      started_at = planned_start
  where status = 'planned'
    and planned_start is not null
    and planned_start <= now();

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

revoke all on function public.auto_start_due_trips_system() from public;

create or replace function public.auto_start_due_trips(p_session_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_affected integer;
begin
  perform * from public.require_driver(p_session_token);
  v_affected := public.auto_start_due_trips_system();
  return json_build_object('ok', true, 'started', v_affected);
end;
$$;

grant execute on function public.auto_start_due_trips(text) to anon, authenticated;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'auto-start-due-trips'
  ) then
    perform cron.unschedule('auto-start-due-trips');
  end if;
end;
$$;

select cron.schedule(
  'auto-start-due-trips',
  '* * * * *',
  $$select public.auto_start_due_trips_system();$$
);
