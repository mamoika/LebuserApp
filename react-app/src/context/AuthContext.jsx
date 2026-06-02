import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'lebuser_user';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    setLoading(false);
  }, []);

  // Sprawdź czy login istnieje i czy ma hasło
  const checkUsername = async (username) => {
    const { data, error } = await supabase.rpc('check_username', { p_username: username });
    if (error) return { error: error.message };
    return data;
  };

  // Ustaw hasło przy pierwszym logowaniu
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    setUser(userData);
    return { ok: true };
  };

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      checkUsername,
      setFirstPassword,
      signOut,
      isAdmin: user?.role === 'admin',
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
