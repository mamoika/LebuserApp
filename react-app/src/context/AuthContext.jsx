import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import i18n, { SUPPORTED_LANGUAGES } from '../i18n';
import { setSentryUser, clearSentryUser } from '../lib/sentry';

const applyLanguage = (lang) => {
  if (lang && SUPPORTED_LANGUAGES.includes(lang) && i18n.language !== lang) {
    i18n.changeLanguage(lang);
  }
};

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'lebuser_user';
const BACKUP_KEY  = 'lebuser_admin_backup'; // kopia sesji admina podczas impersonacji
const MAX_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const PRIVACY_NOTICE_VERSION = 'privacy_notice_v1';

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

  // Po odświeżeniu strony przywróć język z zapisanej sesji (źródło prawdy = baza).
  useEffect(() => {
    applyLanguage(user?.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Powiąż błędy w Sentry z zalogowanym użytkownikiem (id konta, login, rola)
  // — żeby od razu wiedzieć, czy coś pękło u kierowcy, czy u admina.
  useEffect(() => {
    if (user?.id) setSentryUser({ id: user.id, username: user.username, role: user.role });
    else clearSentryUser();
  }, [user?.id, user?.username, user?.role]);

  const storeUser = useCallback((userData) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    setUser(userData);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BACKUP_KEY);
    setUser(null);
    setAdminBackup(null);
  }, []);

  const refreshUserProfile = useCallback(async () => {
    if (!user?.session_token) return;
    const { data, error } = await supabase.rpc('session_user', {
      p_session_token: user.session_token,
    });
    if (error) return;
    const fresh = Array.isArray(data) ? data[0] : data;
    if (!fresh?.id) {
      clearSession();
      return;
    }
    setUser((prev) => {
      if (!prev || prev.session_token !== user.session_token) return prev;
      const next = {
        ...prev,
        id: fresh.id,
        username: fresh.username,
        name: fresh.name,
        role: fresh.role,
        routes: fresh.routes,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [clearSession, user?.session_token]);

  useEffect(() => {
    refreshUserProfile();
  }, [refreshUserProfile]);

  useEffect(() => {
    if (!user?.session_expires_at) return undefined;
    const expiresAt = Date.parse(user.session_expires_at);
    if (!Number.isFinite(expiresAt)) return undefined;

    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) {
      clearSession();
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      clearSession();
    }, Math.min(msUntilExpiry, MAX_SESSION_TIMEOUT_MS));
    return () => window.clearTimeout(timeoutId);
  }, [clearSession, user?.session_expires_at]);

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
      language: data.language,
      privacy_notice_ack_at: data.privacy_notice_ack_at,
      privacy_notice_ack_version: data.privacy_notice_ack_version,
      session_token: data.session_token,
      session_expires_at: data.session_expires_at,
    };
    storeUser(userData);
    applyLanguage(data.language);
    return { ok: true };
  };

  const impersonate = async (targetUserId) => {
    const { data, error } = await supabase.rpc('admin_impersonate_user', {
      p_session_token: user?.session_token || null,
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
      language: data.language,
      has_password: data.has_password,
      privacy_notice_ack_at: data.privacy_notice_ack_at,
      privacy_notice_ack_version: data.privacy_notice_ack_version,
      session_token: data.session_token,
      session_expires_at: data.session_expires_at,
    };
    storeUser(targetUser);
    applyLanguage(data.language);
    return { ok: true };
  };

  // Zmiana języka interfejsu. Aktualizuje i18n + localStorage (przez detektor),
  // a dla zalogowanego użytkownika zapisuje preferencję w bazie.
  const setLanguage = useCallback(async (lang) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return { error: i18n.t('auth.unsupportedLanguage') };
    await i18n.changeLanguage(lang);
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, language: lang };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    const token = user?.session_token;
    if (token) {
      const { error } = await supabase.rpc('set_user_language', {
        p_session_token: token,
        p_language: lang,
      });
      if (error) return { error: error.message };
    }
    return { ok: true };
  }, [user?.session_token]);

  const acknowledgePrivacyNotice = async (version = PRIVACY_NOTICE_VERSION) => {
    const { data, error } = await supabase.rpc('acknowledge_privacy_notice', {
      p_session_token: user?.session_token || null,
      p_version: version,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };

    const nextUser = {
      ...user,
      privacy_notice_ack_at: data.privacy_notice_ack_at,
      privacy_notice_ack_version: data.privacy_notice_ack_version,
    };
    storeUser(nextUser);
    return { ok: true };
  };

  // Wróć do konta admina
  const stopImpersonating = () => {
    if (!adminBackup) return { error: i18n.t('auth.noSavedAdminSession') };
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
  const isAdminViewer = role === 'admin_viewer' || role === 'admin_viewer_driver';
  const isDriver = role === 'driver' || role === 'admin_viewer_driver';
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
      acknowledgePrivacyNotice,
      setLanguage,
      refreshUserProfile,
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
