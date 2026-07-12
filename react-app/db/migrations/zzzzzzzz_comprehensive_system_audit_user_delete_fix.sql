-- Log usunięcia konta powstaje przed skasowaniem użytkownika. Dzięki temu
-- działa również przy usuwaniu własnego konta, a FK aktora przechodzi na NULL.
drop trigger if exists audit_users on public.users;
drop trigger if exists audit_users_change on public.users;
drop trigger if exists audit_users_delete on public.users;

create trigger audit_users_change
after insert or update on public.users
for each row execute function private.audit_table_change('security', 'user', 'id', 'name');

create trigger audit_users_delete
before delete on public.users
for each row execute function private.audit_table_change('security', 'user', 'id', 'name');
