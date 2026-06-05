import { createContext, useContext, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'lebuser_user';
const BACKUP_KEY  = 'lebuser_admin_backup'; // kopia sesji admina podczas impersonacji

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try { return JSON.parse(stored); } catch { localStorage.removeItem(STORAGE_KEY); return null; }
  });

  const [adminBackup, setAdminBackup] = useState(() => {
    const backup = localStorage.getItem(BACKUP_KEY);
    if (!backup) return null;
    try { return JSON.parse(backup); } catch { localStorage.removeItem(BACKUP_KEY); return null; }
  });

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

  const signOut = () => {
    const token = user?.session_token;
    if (token) {
      supabase.rpc('logout_user', { p_session_token: token });
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BACKUP_KEY);
    setUser(null);
    setAdminBackup(null);
  };

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
