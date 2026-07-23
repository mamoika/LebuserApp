-- require_admin zwraca identyfikator użytkownika, więc nazwę archiwizującego
-- pobieramy jawnie z tabeli users.

begin;

create or replace function public.admin_archive_client(
  p_session_token text,
  p_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_admin_id uuid;
  v_admin_name text;
  v_client public.clients;
begin
  v_admin_id := public.require_admin(p_session_token);
  select name into v_admin_name
  from public.users
  where id = v_admin_id;

  select * into v_client
  from public.clients
  where id = p_id
  for update;

  if v_client.id is null then
    return json_build_object('error', 'Nie znaleziono klienta');
  end if;
  if v_client.archived_at is not null then
    return json_build_object('error', 'Punkt jest już w archiwum');
  end if;

  update public.clients
  set archived_at = now(),
      archived_by = coalesce(v_admin_name, 'Administrator')
  where id = p_id;

  perform private.resync_current_service_trips();

  return json_build_object('ok', true, 'name', v_client.name);
end;
$$;

grant execute on function public.admin_archive_client(text, uuid)
to anon, authenticated;

commit;
