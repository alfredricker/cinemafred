'use client';
import { MovieDetails } from '@/components/movies/MovieDetails';
import { Header } from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }
  
  if (!user) redirect('/login');

  return children;
}

export default function MoviePage({ params }: { params: { id: string } }) {
  return (
    <AuthWrapper>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <Header />
        <main className="px-20">
          <div className="max-w-[120rem] mx-auto space-y-8">
            <MovieDetails id={params.id} />
          </div>
        </main>
      </div>
    </AuthWrapper>
  );
}