-- Generated with `supabase migration new reconcile_current_trolley_locations`.

-- Forward-only production correction.  Previous values remain recoverable from
-- public.logs because both entries and trolley cycles are audited by triggers.
begin;

do $correction$
declare
  v_actor public.users;
begin
  select * into v_actor
  from public.users
  where username = 'mamoika' or name = 'Ruslan Mamoika'
  order by case when username = 'mamoika' then 0 else 1 end
  limit 1;

  perform set_config('app.audit_user_id', coalesce(v_actor.id::text, ''), true);
  perform set_config('app.audit_user_name', coalesce(v_actor.name, 'Ruslan Mamoika'), true);
  perform set_config('app.audit_user_role', coalesce(v_actor.role, 'admin'), true);
  perform set_config('app.audit_effective_user_id', coalesce(v_actor.id::text, ''), true);
  perform set_config('app.audit_effective_user_name', coalesce(v_actor.name, 'Ruslan Mamoika'), true);
  perform set_config('app.audit_effective_user_role', coalesce(v_actor.role, 'admin'), true);

  -- Close only the reservations observed during the 8 October incident.  The
  -- trolley numbers stay on the rows for history, while `washed = true`
  -- releases them from current physical occupancy.
  update public.entries entry
  set washed = true,
      washed_at = coalesce(entry.washed_at, now()),
      washed_by = coalesce(nullif(entry.washed_by, ''), coalesce(v_actor.name, 'Ruslan Mamoika')),
      laundry_status = case
        when coalesce(entry.laundry_status, 'pending') = 'pending' then 'washed'
        else entry.laundry_status
      end
  where entry.deleted_at is null
    and not coalesce(entry.washed, false)
    and entry.added_at <= timestamptz '2026-10-08 14:30:00+02'
    and exists (
      select 1
      from private.active_arrival_trolley_reservations() reservation
      where reservation.entry_id = entry.id
    );

  -- The driver physically left trolleys 1 and 2 at Motel One.  Restore both
  -- cycles as the authoritative current location using the recorded pickup and
  -- delivery times from their linked entry.
  update public.laundry_trolley_cycles cycle
  set status = 'at_client',
      released_at = coalesce(
        cycle.released_at,
        (
          select max(entry.picked_at::timestamptz)
          from public.entries entry
          where entry.id = any(cycle.entry_ids)
        )
      ),
      released_by = coalesce(
        cycle.released_by,
        (
          select max(entry.picked_by)
          from public.entries entry
          where entry.id = any(cycle.entry_ids)
        )
      ),
      delivered_at = coalesce(
        cycle.delivered_at,
        (
          select max(entry.delivered_at)
          from public.entries entry
          where entry.id = any(cycle.entry_ids)
        )
      ),
      delivered_by = coalesce(
        cycle.delivered_by,
        (
          select max(entry.delivered_by)
          from public.entries entry
          where entry.id = any(cycle.entry_ids)
        )
      ),
      returned_at = null,
      returned_by = null,
      notes = concat_ws(
        ' | ',
        nullif(cycle.notes, ''),
        'Korekta 08.10.2026: wózek pozostawiony w Motel One'
      ),
      updated_at = now()
  where cycle.client_name = 'Motel One'
    and cycle.trolley_no in ('1', '2')
    and cycle.packed_at >= timestamptz '2026-10-07 00:00:00+02'
    and cycle.packed_at < timestamptz '2026-10-08 00:00:00+02'
    and exists (
      select 1
      from public.entries entry
      where entry.id = any(cycle.entry_ids)
        and entry.client_name = 'Motel One'
        and coalesce(entry.delivered, false)
        and entry.delivered_at is not null
    );

  if exists (
    select 1
    from private.active_arrival_trolley_reservations() reservation
    join public.entries entry on entry.id = reservation.entry_id
    where entry.added_at <= timestamptz '2026-10-08 14:30:00+02'
  ) then
    raise exception 'Nie udało się domknąć starych rezerwacji wózków';
  end if;

  if (
    select count(*)
    from public.laundry_trolley_cycles cycle
    where cycle.returned_at is null
      and cycle.status not in ('returned', 'canceled')
      and lower(trim(cycle.trolley_no)) <> 'brak'
  ) <> 2
  or exists (
    select 1
    from public.laundry_trolley_cycles cycle
    where cycle.returned_at is null
      and cycle.status not in ('returned', 'canceled')
      and lower(trim(cycle.trolley_no)) <> 'brak'
      and not (
        cycle.client_name = 'Motel One'
        and cycle.trolley_no in ('1', '2')
        and cycle.status = 'at_client'
      )
  ) then
    raise exception 'Po korekcie aktywne powinny być wyłącznie wózki 1 i 2 w Motel One';
  end if;
end;
$correction$;

commit;
