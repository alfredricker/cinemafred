'use client';
import { useState } from 'react';
import { X, Loader2, KeyRound } from 'lucide-react';

interface PasswordResetDialogProps {
  onUpdatePassword: (newPassword: string) => Promise<void>;
  onClose: () => void;
}

export const PasswordResetDialog = ({ onUpdatePassword, onClose }: PasswordResetDialogProps) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      setIsLoading(true);
      await onUpdatePassword(newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md relative">
          <div className="flex items-center gap-3 mb-6">
            <KeyRound className="h-6 w-6 text-blue-500" />
            <h2 className="text-xl font-bold text-white">Reset Password</h2>
          </div>

          <p className="text-gray-400 mb-6">
            You need to set a new password before continuing.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                minLength={8}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                minLength={8}
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm bg-red-900/20 p-2 rounded">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </span>
                ) : (
                  'Update Password'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};