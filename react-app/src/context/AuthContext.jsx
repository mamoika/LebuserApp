import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'lebuser_user';
const BACKUP_KEY  = 'lebuser_admin_backup'; // kopia sesji admina podczas impersonacji
const MAX_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

const isSessionExpired = (session) => {
  if (!session?.session_expires_at) return false;
  const expiresAt = Date.parse(session.session_expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
};

const readStoredSession = (key) => {
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (isSessionExpired(parsed)) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readStoredSession(STORAGE_KEY));
  const [adminBackup, setAdminBackup] = useState(() => readStoredSession(BACKUP_KEY));

  useEffect(() => {
    if (!user?.session_expires_at) return undefined;
    const expiresAt = Date.parse(user.session_expires_at);
    if (!Number.isFinite(expiresAt)) return undefined;

    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
      setUser(null);
      setAdminBackup(null);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
      setUser(null);
      setAdminBackup(null);
    }, Math.min(msUntilExpiry, MAX_SESSION_TIMEOUT_MS));
    return () => window.clearTimeout(timeoutId);
  }, [user?.session_expires_at]);

  const checkUsername = async (username) => {
    const { data, error } = await supabase.rpc('check_username', { p_username: username });
    if (error) return { error: error.message };
    return data;
  };

  const setFirstPassword = async (username, password) => {
    const { data, error } = await supabase.rpc('set_first_password', {
      p_username: username,
      p_password: password,
    });
    if (error) return { error: error.message };
    return data;
  };

  const login = async (username, password) => {
    const { data, error } = await supabase.rpc('login_user', {
      p_username: username,
      p_password: password,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };

    const userData = {
      id: data.id,
      username: data.username,
      name: data.name,
      role: data.role,
      routes: data.routes,
      session_token: data.session_token,
      session_expires_at: data.session_expires_at,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    setUser(userData);
    return { ok: true };
  };

  // Admin wchodzi na konto innego usera
  const impersonate = async (targetUserId) => {
    const { data, error } = await supabase.rpc('admin_impersonate_user', {
      p_session_token: user?.session_token,
      p_user_id: targetUserId,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };

    // Zapisz backup aktualnej sesji admina
    const backup = user;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    setAdminBackup(backup);

    const targetUser = {
      id: data.id,
      username: data.username,
      name: data.name,
      role: data.role,
      routes: data.routes,
      has_password: data.has_password,
      session_token: data.session_token,
      session_expires_at: data.session_expires_at,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(targetUser));
    setUser(targetUser);
    return { ok: true };
  };

  // Wróć do konta admina
  const stopImpersonating = () => {
    if (!adminBackup) return { error: 'Brak zapisanej sesji admina' };
    if (!adminBackup.session_token) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
      setUser(null);
      setAdminBackup(null);
      return { needsLogin: true };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adminBackup));
    localStorage.removeItem(BACKUP_KEY);
    setUser(adminBackup);
    setAdminBackup(null);
    return { ok: true };
  };

  const signOut = useCallback(() => {
    const token = user?.session_token;
    if (token) {
      supabase.rpc('logout_user', { p_session_token: token });
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BACKUP_KEY);
    setUser(null);
    setAdminBackup(null);
  }, [user?.session_token]);

  const role = user?.role ?? null;
  const isAdmin = role === 'admin';
  const isAdminViewer = role === 'admin_viewer';
  const isDriver = role === 'driver';
  const isViewer = role === 'viewer';
  const canViewAdminData = isAdmin || isAdminViewer;

  return (
    <AuthContext.Provider value={{
      user,
      sessionToken: user?.session_token ?? null,
      adminBackup,       // nie null = jesteśmy w trybie impersonacji
      login,
      checkUsername,
      setFirstPassword,
      impersonate,
      stopImpersonating,
      signOut,
      isAdmin,
      isAdminViewer,
      isDriver,
      isViewer,
      canViewAdminData,
      canEdit:  isAdmin || isDriver,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
