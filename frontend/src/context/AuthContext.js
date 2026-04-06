import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Check saved token on app start
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/auth/me`, {
      headers: { 'x-auth-token': token }
    })
      .then(r => {
        if (!r.ok) throw new Error('Invalid session');
        return r.json();
      })
      .then(data => {
        setUser(data);
      })
      .catch(() => {
        // Token invalid or backend unreachable — clear it, force login
        localStorage.removeItem('auth_token');
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (username, password) => {
    const r = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur de connexion');
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    const token = localStorage.getItem('auth_token');
    // Clear local state immediately — don't wait for server response
    localStorage.removeItem('auth_token');
    setUser(null);
    // Fire-and-forget server logout
    if (token) {
      fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'x-auth-token': token }
      }).catch(() => {});
    }
  };

  const can = useCallback((permission) => {
    if (!user) return false;
    return (user.permissions || []).includes(permission);
  }, [user]);

  const canAny = useCallback((...perms) => {
    if (!user) return false;
    return perms.some(p => (user.permissions || []).includes(p));
  }, [user]);

  const authFetch = useCallback((url, options = {}) => {
    const token = localStorage.getItem('auth_token');
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { 'x-auth-token': token } : {})
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, canAny, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;