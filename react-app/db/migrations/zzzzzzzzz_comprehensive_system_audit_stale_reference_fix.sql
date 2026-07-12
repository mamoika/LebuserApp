-- Audyt nie może zablokować operacji, gdy kontekst wskazuje sesję lub konto
-- usunięte wcześniej w tej samej transakcji. Snapshot tekstowy pozostaje.
create or replace function private.audit_clear_stale_references()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.actor_user_id is not null
    and not exists (select 1 from public.users where id = new.actor_user_id)
  then
    new.actor_user_id := null;
  end if;
  if new.session_id is not null
    and not exists (select 1 from public.user_sessions where id = new.session_id)
  then
    new.session_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_clear_stale_references on public.logs;
create trigger audit_logs_clear_stale_references
before insert on public.logs
for each row execute function private.audit_clear_stale_references();

revoke execute on function private.audit_clear_stale_references() from public, anon, authenticated;
