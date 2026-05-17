'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Film, Lock, User } from 'lucide-react';

export default function TVLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (user && !user.mustResetPassword) router.replace('/tv/browse');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const ok = await login(username, password);
      if (!ok) setError('Invalid credentials');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const focusable = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>('input, button:not([disabled])') ?? []
    );
    const idx = focusable.indexOf(document.activeElement as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? focusable[idx + 1] : focusable[idx - 1];
    next?.focus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-xl space-y-10 px-8">
        <div className="text-center">
          <Film className="h-24 w-24 text-blue-500 mx-auto" />
          <h1 className="mt-6 text-5xl font-bold text-white">CinemaFred</h1>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-6">
          <div className="relative">
            <User className="absolute left-5 top-1/2 -translate-y-1/2 h-7 w-7 text-gray-400 pointer-events-none" />
            <input
              autoFocus
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full pl-16 pr-5 py-5 text-xl bg-gray-900 border-2 border-gray-700 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-7 w-7 text-gray-400 pointer-events-none" />
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full pl-16 pr-5 py-5 text-xl bg-gray-900 border-2 border-gray-700 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
            />
          </div>

          {error && <p className="text-red-400 text-center text-lg">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-5 text-xl font-bold bg-blue-600 hover:bg-blue-700 focus:outline-none focus:border-white border-2 border-transparent rounded-2xl transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
