-- 1. Pozwól na NULL w password_hash (brak hasła = konto bez hasła = pierwsze logowanie)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT NULL;

-- 2. Sprawdź czy użytkownik istnieje i jaki jest jego status hasła
CREATE OR REPLACE FUNCTION check_username(p_username TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT id, username, name, role, password_hash IS NOT NULL AS has_password
  INTO v_user
  FROM users
  WHERE username = lower(trim(p_username));

  IF v_user.id IS NULL THEN
    RETURN json_build_object('error', 'Nie znaleziono użytkownika');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'has_password', v_user.has_password,
    'name', v_user.name
  );
END;
$$;

-- 3. Ustaw hasło przy pierwszym logowaniu (tylko jeśli hasło_hash IS NULL)
CREATE OR REPLACE FUNCTION set_first_password(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT id, password_hash INTO v_user
  FROM users
  WHERE username = lower(trim(p_username));

  IF v_user.id IS NULL THEN
    RETURN json_build_object('error', 'Nie znaleziono użytkownika');
  END IF;

  IF v_user.password_hash IS NOT NULL THEN
    RETURN json_build_object('error', 'Hasło zostało już ustawione');
  END IF;

  IF length(trim(p_password)) < 4 THEN
    RETURN json_build_object('error', 'Hasło musi mieć co najmniej 4 znaki');
  END IF;

  UPDATE users
  SET password_hash = crypt(p_password, gen_salt('bf'))
  WHERE username = lower(trim(p_username));

  RETURN json_build_object('ok', true);
END;
$$;

-- 4. Logowanie (bez zmian, ale teraz password_hash może być NULL)
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT id, username, name, role, routes, password_hash
  INTO v_user
  FROM users
  WHERE username = lower(trim(p_username));

  IF v_user.id IS NULL THEN
    RETURN json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  END IF;

  IF v_user.password_hash IS NULL THEN
    RETURN json_build_object('error', 'Konto nie ma jeszcze ustawionego hasła');
  END IF;

  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN json_build_object('error', 'Nieprawidłowa nazwa użytkownika lub hasło');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'id', v_user.id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role,
    'routes', v_user.routes
  );
END;
$$;

-- 5. Admin: resetuj hasło (ustawia NULL — przy następnym logowaniu user ustawi nowe)
CREATE OR REPLACE FUNCTION admin_reset_password(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users SET password_hash = NULL WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Nie znaleziono użytkownika');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;

-- 6. Admin: utwórz nowego użytkownika (bez hasła)
CREATE OR REPLACE FUNCTION admin_create_user(p_username TEXT, p_name TEXT, p_role TEXT DEFAULT 'driver')
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF lower(trim(p_role)) NOT IN ('admin', 'admin_viewer', 'driver', 'viewer') THEN
    RETURN json_build_object('error', 'Nieprawidłowa rola');
  END IF;

  INSERT INTO users (username, name, role, password_hash)
  VALUES (lower(trim(p_username)), trim(p_name), lower(trim(p_role)), NULL)
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('error', 'Użytkownik o tej nazwie już istnieje');
END;
$$;

-- 7. Admin: pobierz wszystkich użytkowników (rozszerzone o status hasła)
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE(id UUID, username TEXT, name TEXT, role TEXT, routes TEXT, created_at TIMESTAMPTZ, has_password BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.name, u.role, u.routes, u.created_at,
         (u.password_hash IS NOT NULL) AS has_password
  FROM users u
  ORDER BY u.created_at;
END;
$$;
