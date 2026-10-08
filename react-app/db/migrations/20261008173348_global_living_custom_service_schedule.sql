-- Global Living 5512: brudne przyjeżdża we wtorek i sobotę,
-- a czyste wyjeżdża przy następnym terminie obsługi.
-- Wt -> So (4 dni), So -> Wt następnego tygodnia (3 dni).

begin;

update public.clients
set service_schedule_mode = 'custom',
    service_turnaround_days = '{"2":4,"6":3}'::jsonb
where lower(trim(name)) = 'global living 5512';

delete from public.client_service_rules rule
using public.clients client
where rule.client_id = client.id
  and lower(trim(client.name)) = 'global living 5512';

insert into public.client_service_rules (client_id, weekday, interval_weeks, anchor_week)
select client.id, day.weekday::smallint, 1, date '2026-10-05'
from public.clients client
cross join lateral unnest(array[2, 6]::integer[]) as day(weekday)
where lower(trim(client.name)) = 'global living 5512';

commit;
