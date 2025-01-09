// src/app/reset-password/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, updatePassword } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || !user.mustResetPassword) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);

    try {
      await updatePassword(password);
      router.push('/');
    } catch (err) {
      setError('Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user?.mustResetPassword) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">Reset Password</h2>
          <p className="mt-2 text-gray-400">Please set a new password to continue</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50
                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="New password"
                minLength={8}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50
                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Confirm new password"
                minLength={8}
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
            {isLoading ? 'Updating...' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}