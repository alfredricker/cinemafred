'use client';
import { Header } from '@/components/Header';
import { MovieGrid } from '@/components/MovieGrid';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <Header />
      <main className="px-20">
        <div className="max-w-[120rem] mx-auto pt-8 pb-16">
          {/* MovieGrid now handles its own data fetching */}
          <MovieGrid />
        </div>
      </main>
    </div>
  );
}