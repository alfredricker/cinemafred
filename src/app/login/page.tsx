// src/app/login/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Film, Lock, User, UserCircle } from 'lucide-react';
import { redirect, useRouter } from 'next/navigation';
import { PasswordResetDialog } from '@/components/PasswordResetDialog';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const { login, loginAsGuest, updatePassword, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !user.mustResetPassword) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(username, password);
      if (success) {
        // The useEffect will handle the redirect if needed
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = () => {
    loginAsGuest();
    router.push('/');
  };

  const handlePasswordReset = async (newPassword: string) => {
    try {
      await updatePassword(newPassword);
      router.push('/');
    } catch (error) {
      throw error;
    }
  };

  useEffect(() => {
    if (user?.mustResetPassword) {
      setShowResetDialog(true);
    }
  }, [user]);

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center">
          <div className="flex justify-center">
            <Film className="h-16 w-16 text-blue-500" />
          </div>
          <h2 className="mt-8 text-3xl font-verdana text-white">CinemaFred</h2>
          <p className="mt-4 text-sm text-gray-400">Authorized access only</p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50 
                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Username"
              />
            </div>
            
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50
                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Password"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent
                     text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700
                     focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Verifying...' : 'Sign in'}
          </button>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleGuestLogin}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2"
            >
              <UserCircle className="h-4 w-4" />
              Continue as Guest
            </button>
          </div>
        </form>
      </div>

      {showResetDialog && (
        <PasswordResetDialog
          onUpdatePassword={handlePasswordReset}
          onClose={() => setShowResetDialog(false)}
        />
      )}
    </div>
  );
}