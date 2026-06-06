-- ============================================================
--  Preferencja języka interfejsu (i18n: pl / de)
--
--  Dodaje kolumnę `language` do users, RPC do jej zmiany przez
--  zalogowanego użytkownika oraz zwraca język w login_user /
--  admin_impersonate_user, aby aplikacja mogła ustawić język od razu
--  po zalogowaniu. Wartość jest też cache'owana lokalnie (localStorage).
-- ============================================================

alter table public.users
  add column if not exists language text not null default 'pl';

-- Dozwolone tylko obsługiwane języki.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_language_check'
  ) then
    alter table public.users
      add constraint users_language_check check (language in ('pl', 'de'));
  end if;
end$$;

-- Zalogowany użytkownik zmienia własny język.
create or replace function public.set_user_language(
  p_session_token text,
  p_language text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_lang text := lower(trim(coalesce(p_language, '')));
begin
  select * into v_user from public.session_user(p_session_token) limit 1;
  if v_user.id is null then
    raise exception 'Invalid or expired session' using errcode = '28000';
  end if;

  if v_lang not in ('pl', 'de') then
    return json_build_object('error', 'Nieobsługiwany język');
  end if;

  update public.users
  set language = v_lang
  where id = v_user.id;

  return json_build_object('ok', true, 'language', v_lang);
end;
$$;

-- login_user: dołóż `language` do odpowiedzi (reszta bez zmian).
drop function if exists public.login_user(text, text);
create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
begin
  select id, username, name, role, routes, password_hash,
         privacy_notice_ack_at, privacy_notice_ack_version, language
  into v_user
  from public.users
  where username = lower(trim(p_username));

  if v_user.id is null then
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;

  if v_user.password_hash is null then
    return json_build_object('error', 'Konto nie ma jeszcze ustawionego hasła');
  end if;

  if v_user.password_hash != crypt(p_password, v_user.password_hash) then
    return json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  end if;

  select * into v_session from public.create_user_session(v_user.id) limit 1;

  return json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes,
    'language', v_user.language,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_session.session_token,
    'session_expires_at', v_session.expires_at
  );
end;
$$;

-- admin_impersonate_user: też zwróć język użytkownika docelowego.
drop function if exists public.admin_impersonate_user(text, uuid);
create or replace function public.admin_impersonate_user(p_session_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_session record;
begin
  perform public.require_admin(p_session_token);

  select id, username, name, role, routes, password_hash is not null as has_password,
         privacy_notice_ack_at, privacy_notice_ack_version, language
  into v_user
  from public.users
  where id = p_user_id;

  if v_user.id is null then
    return json_build_object('error', 'Nie znaleziono użytkownika');
  end if;

  select * into v_session from public.create_user_session(v_user.id) limit 1;

  return json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes,
    'language', v_user.language,
    'has_password', v_user.has_password,
    'privacy_notice_ack_at', v_user.privacy_notice_ack_at,
    'privacy_notice_ack_version', v_user.privacy_notice_ack_version,
    'session_token', v_session.session_token,
    'session_expires_at', v_session.expires_at
  );
end;
$$;

grant execute on function public.set_user_language(text, text) to anon, authenticated;
grant execute on function public.login_user(text, text) to anon, authenticated;
grant execute on function public.admin_impersonate_user(text, uuid) to anon, authenticated;
