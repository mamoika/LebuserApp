import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'lebuser_user';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Odczytaj sesję z localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
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
    } catch (err) {
      return { error: "Wystąpił błąd sieciowy lub serwera: " + err.message };
    }
  };

  const register = async (username, password, name) => {
    const { data, error } = await supabase.rpc('register_user', {
      p_username: username,
      p_password: password,
      p_name: name,
    });

    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { ok: true, id: data.id };
  };

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const value = {
    user,
    login,
    register,
    signOut,
    isAdmin: user?.role === 'admin',
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
