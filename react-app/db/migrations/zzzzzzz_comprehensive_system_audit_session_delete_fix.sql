-- Log usunięcia sesji musi powstać przed skasowaniem rekordu; po usunięciu
-- klucz obcy logs.session_id automatycznie ustawi się na NULL.
drop trigger if exists audit_user_sessions on public.user_sessions;
drop trigger if exists audit_user_sessions_change on public.user_sessions;
drop trigger if exists audit_user_sessions_delete on public.user_sessions;

create trigger audit_user_sessions_change
after insert or update on public.user_sessions
for each row execute function private.audit_table_change('security', 'session', 'id', 'device_label');

create trigger audit_user_sessions_delete
before delete on public.user_sessions
for each row execute function private.audit_table_change('security', 'session', 'id', 'device_label');
