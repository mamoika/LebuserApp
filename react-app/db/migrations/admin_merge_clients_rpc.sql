-- Scalanie duplikatów klientów.
-- Użycie: wybierz błędnego klienta jako source i poprawnego jako target.
-- Wpisy, logi i dodatkowe przystanki przechodzą na target, a source znika z clients.

create or replace function public.admin_merge_clients(
  p_session_token text,
  p_source_client_id uuid,
  p_target_client_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.clients%rowtype;
  v_target public.clients%rowtype;
  v_entries_count integer := 0;
  v_logs_count integer := 0;
begin
  perform public.require_admin(p_session_token);

  if p_source_client_id = p_target_client_id then
    return json_build_object('error', 'Wybierz dwóch różnych klientów');
  end if;

  select * into v_source from public.clients where id = p_source_client_id;
  select * into v_target from public.clients where id = p_target_client_id;

  if v_source.id is null then
    return json_build_object('error', 'Nie znaleziono klienta źródłowego');
  end if;
  if v_target.id is null then
    return json_build_object('error', 'Nie znaleziono klienta docelowego');
  end if;

  update public.entries
  set client_name = v_target.name,
      route_id = v_target.route_id
  where client_name = v_source.name;
  get diagnostics v_entries_count = row_count;

  update public.logs
  set client_name = v_target.name
  where client_name = v_source.name;
  get diagnostics v_logs_count = row_count;

  update public.driver_trips dt
  set extra_clients = (
    select coalesce(
      jsonb_agg(distinct case when x.value = v_source.name then v_target.name else x.value end)::text,
      '[]'
    )
    from jsonb_array_elements_text(coalesce(nullif(dt.extra_clients, ''), '[]')::jsonb) as x(value)
  )
  where coalesce(nullif(dt.extra_clients, ''), '[]')::jsonb ? v_source.name;

  update public.clients
  set note = case when nullif(note, '') is null then v_source.note else note end
  where id = v_target.id;

  delete from public.clients where id = v_source.id;

  return json_build_object(
    'ok', true,
    'source', v_source.name,
    'target', v_target.name,
    'entries', v_entries_count,
    'logs', v_logs_count
  );
end;
$$;

grant execute on function public.admin_merge_clients(text, uuid, uuid) to anon, authenticated;
