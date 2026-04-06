// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export interface UserProfile {
  id?: string;
  email: string;
  full_name: string;
  department_id?: string;
  avatar?: string;
  avatar_url?: string;
  designation?: string;
  contact?: string;
  working_hours?: string;
  employee_id?: string;
  responsibilities?: string;
  last_login?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface AuthContextType {
  profile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  saveOAuthLogin: (token: string, profile: UserProfile | null) => Promise<void>;
  getAuthToken: () => string | null;
  refreshProfile: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const normalizeProfile = (incoming: any): UserProfile | null => {
    if (!incoming || typeof incoming !== 'object' || !incoming.email) return null;

    return {
      id: incoming.id || incoming._id || '',
      email: incoming.email || '',
      full_name: incoming.full_name || '',
      department_id: incoming.department_id || '',
      avatar: incoming.avatar || incoming.avatar_url || '',
      avatar_url: incoming.avatar_url || incoming.avatar || '',
      designation: incoming.designation || '',
      contact: incoming.contact || '',
      working_hours: incoming.working_hours || '',
      employee_id: incoming.employee_id || '',
      responsibilities: incoming.responsibilities || '',
      last_login: incoming.last_login || null,
      createdAt: incoming.createdAt || incoming.created_at || null,
      updatedAt: incoming.updatedAt || incoming.updated_at || null,
    };
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedProfile = localStorage.getItem('profile');

    if (token && storedProfile) {
      try {
        const parsedProfile = normalizeProfile(JSON.parse(storedProfile));
        if (parsedProfile) {
          setProfile(parsedProfile);
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('profile');
        }
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('profile');
      }
    }

    setLoading(false);

    if (token) {
      void refreshProfile();
    }
  }, []);

  const refreshProfile = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch('http://localhost:5000/api/profile/me', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) return;
      const updatedUser = normalizeProfile(await res.json());
      if (!updatedUser) return;
      localStorage.setItem('profile', JSON.stringify(updatedUser));
      setProfile(updatedUser);
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  const signIn = async (email: string, password: string) => {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Invalid credentials');
    }

    const data = await res.json();
    const fullProfile = normalizeProfile(data.user);

    if (!fullProfile) {
      throw new Error('Invalid user profile returned from server');
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('profile', JSON.stringify(fullProfile));
    setProfile(fullProfile);
    await refreshProfile();
  };

  const saveOAuthLogin = async (token: string, userProfile: UserProfile | null) => {
    const normalizedProfile = normalizeProfile(userProfile);

    if (!normalizedProfile) {
      console.error('Cannot save OAuth login: invalid profile');
      return;
    }

    try {
      localStorage.setItem('token', token);
      localStorage.setItem('profile', JSON.stringify(normalizedProfile));
      setProfile(normalizedProfile);
      await refreshProfile();
    } catch (error) {
      console.error('Error saving OAuth login:', error);
    }
  };

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profile');
    setProfile(null);
  };

  const getAuthToken = () => localStorage.getItem('token');

  return (
    <AuthContext.Provider
      value={{
        profile,
        signIn,
        signOut,
        loading,
        saveOAuthLogin,
        getAuthToken,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
