import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: () => void;
  localLogin: (creds: any) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');

    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = localStorage.getItem('token');
    if (token) {
        fetchUser();
    } else {
        setIsLoading(false);
    }
  }, []);

  const fetchUser = async () => {
      try {
          // In a real app we'd fetch from /auth/me. 
          // For now, if we have a token, we assume logged in.
          // If the token matches our superadmin-mock-token, we set a specific user
          const token = localStorage.getItem('token');
          // Check if it's a local user token (format: local-user-{id}) or the mock superadmin token
          if (token === 'superadmin-mock-token' || token?.startsWith('local-user-')) {
              setUser({ id: 1, email: 'admin@cpdemo.com', name: 'Super Admin', role: 'admin' });
          } else {
             setUser({ id: 1, email: 'demo@example.com', name: 'Demo Instructor', role: 'instructor' });
          }
      } catch (error) {
          console.error("Failed to fetch user", error);
          localStorage.removeItem('token');
      } finally {
          setIsLoading(false);
      }
  };

  const login = () => {
    // Redirect to backend auth via proxy
    window.location.href = '/auth/login';
  };

  const localLogin = async (creds: any) => {
      try {
          const res = await api.post('/auth/local-login', creds);
          const { token, user } = res.data;
          localStorage.setItem('token', token);
          
          if (user) {
            setUser(user);
          } else if (token === 'superadmin-mock-token') {
              setUser({ id: 0, email: 'admin@cpdemo.com', name: 'Super Admin', role: 'admin' });
          } else {
              // Fallback (e.g. refresh)
              await fetchUser();
          }
      } catch (error) {
          console.error("Local login failed", error);
          throw error;
      }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const refreshUser = async () => {
      await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, login, localLogin, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
