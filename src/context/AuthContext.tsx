// src/context/AuthContext.tsx
'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { UserResponse, AuthResponse } from '@/types/user';

interface AuthContextType {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
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

  useEffect(() => {
    const validateToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsLoading(false);
        return;
      }
    
      try {
        const response = await fetch(API_ROUTES.validate, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ token })
        });
        
        if (response.ok) {
          const { user: validatedUser } = await response.json();
          setUser(validatedUser);
        } else {
          localStorage.removeItem('token');
          setUser(null);
        }
      } catch (error) {
        console.error('Token validation error:', error);
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateToken();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await fetch(API_ROUTES.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json() as AuthResponse;
      
      if (!response.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('token', data.token);
      const userResponse: UserResponse = {
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        isAdmin: data.user.isAdmin,
        isActive: data.user.isActive,
        mustResetPassword: data.user.mustResetPassword
      };
      setUser(userResponse);
      return true;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePassword = async (newPassword: string): Promise<void> => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    try {
      setIsLoading(true);
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

      // Update user state to remove mustResetPassword flag
      if (user) {
        setUser({ ...user, mustResetPassword: false });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await fetch(API_ROUTES.logout, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ login, logout, updatePassword, user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);