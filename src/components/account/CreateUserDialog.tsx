// src/components/CreateUserDialog.tsx
'use client';
import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserCredentials {
  username: string;
  tempPassword: string;
}

export const CreateUserDialog: React.FC<CreateUserDialogProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<UserCredentials | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setCredentials({
        username: data.username,
        tempPassword: data.tempPassword
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <h2 className="text-xl font-bold text-white mb-4">Create New User</h2>

          {credentials ? (
            <div className="space-y-4">
              <div className="bg-blue-900/50 p-4 rounded-lg">
                <h3 className="font-medium text-white mb-2">Temporary Credentials</h3>
                <p className="text-gray-300">Username: <span className="font-mono">{credentials.username}</span></p>
                <p className="text-gray-300">Password: <span className="font-mono">{credentials.tempPassword}</span></p>
              </div>
              <p className="text-sm text-gray-400">
                The user will be required to change these credentials on first login.
              </p>
              <button
                onClick={onClose}
                className="w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {error && (
                <div className="text-red-500 text-sm bg-red-900/20 p-2 rounded">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  'Create User'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
};