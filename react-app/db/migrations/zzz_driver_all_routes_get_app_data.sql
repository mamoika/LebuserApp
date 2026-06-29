-- Kierowca widzi wszystkie trasy i może sam wybrać trasę dnia.
-- Przypisane trasy nadal zostają w users.routes i frontend zaznacza je jako domyślne.

create or replace function public.get_app_data(
  p_session_token text,
  p_last_week_key text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_last_week_key text := coalesce(
    nullif(trim(coalesce(p_last_week_key, '')), ''),
    to_char((date_trunc('week', now())::date - 7), 'YYYY-MM-DD')
  );
  v_clients json;
  v_routes json;
  v_entries json;
  v_receipts json := '[]'::json;
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_clients
  from (
    select *
    from public.clients
    order by sort_order
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_routes
  from (
    select *
    from public.routes
    order by sort_order
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  into v_entries
  from (
    select *
    from public.entries
    where deleted_at is null
      and (
        done = false
        or week_key >= v_last_week_key
        or pick_week_key >= v_last_week_key
      )
  ) x;

  if to_regclass('public.laundry_receipts') is not null then
    execute
      'select coalesce(json_agg(row_to_json(x)), ''[]''::json)
       from (
         select *
         from public.laundry_receipts
         where deleted_at is null
         order by doc_no desc
       ) x'
    into v_receipts;
  end if;

  return json_build_object(
    'ok', true,
    'clients', v_clients,
    'routes', v_routes,
    'entries', v_entries,
    'receipts', v_receipts
  );
end;
$$;

grant execute on function public.get_app_data(text, text) to anon, authenticated;
