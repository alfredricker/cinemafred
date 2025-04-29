// src/context/AuthContext.tsx
'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { UserResponse, AuthResponse } from '@/types/user';

interface AuthContextType {
  login: (username: string, password: string) => Promise<boolean>;
  loginAsGuest: () => void;
  logout: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  user: UserResponse | null;
  isLoading: boolean;
}

const API_ROUTES = {
  login: '/api/auth/login',
  validate: '/api/auth/validate',
  logout: '/api/auth/logout',
  updatePassword: '/api/auth/update-password'
};

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const validateToken = async () => {
      const token = localStorage.getItem('token');
      
      try {
        if (!token) {
          throw new Error('No token found');
        }

        const response = await fetch(API_ROUTES.validate, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ token })
        });
        
        if (!response.ok) {
          throw new Error('Invalid token');
        }

        const { user: validatedUser } = await response.json();
        
        if (isMounted) {
          setUser(validatedUser);
        }
      } catch (error) {
        if (isMounted) {
          localStorage.removeItem('token');
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };

    validateToken();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const response = await fetch(API_ROUTES.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json() as AuthResponse;
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('token', data.token);
      
      setUser({
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        isAdmin: data.user.isAdmin,
        isActive: data.user.isActive,
        mustResetPassword: data.user.mustResetPassword ?? false,
        isGuest: false
      });
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsGuest = () => {
    const guestUser: UserResponse = {
      id: 'guest',
      email: 'guest@cinemafred.com',
      username: 'Guest',
      isAdmin: false,
      isActive: true,
      mustResetPassword: false,
      isGuest: true
    };
    setUser(guestUser);
    localStorage.setItem('isGuest', 'true');
  };

  const updatePassword = async (newPassword: string): Promise<void> => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    setIsLoading(true);

    try {
      const response = await fetch(API_ROUTES.updatePassword, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update password');
      }

      if (user) {
        setUser({ ...user, mustResetPassword: false });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(API_ROUTES.logout, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('isGuest');
      setUser(null);
      setIsLoading(false);
    }
  };

  // Don't render children until initial auth check is complete
  if (!isInitialized) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ login, loginAsGuest, logout, updatePassword, user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);