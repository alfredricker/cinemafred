'use client';
import { Header } from '@/components/Header';
import { MovieGrid } from '@/components/MovieGrid';
import { movies } from '@/data/movies';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <Header />
      <main className="px-4">
        <div className="max-w-7xl mx-auto space-y-8">
          <MovieGrid movies={movies} />
        </div>
      </main>
    </div>
  );
}