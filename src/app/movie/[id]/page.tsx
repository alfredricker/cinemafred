//src/app/movie/[id]/page.tsx
'use client';
import { MovieDetails } from '@/components/MovieDetails';
import { Header } from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="text-gray-400">Loading...</div>;
  if (!user) redirect('/login');

  return children;
}

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  return (
    <AuthWrapper>
      <div className="min-h-screen bg-black text-gray-100">
        <Header />
        <main className="max-w-7xl mx-auto py-8">
          <MovieDetails id={resolvedParams.id} />
        </main>
      </div>
    </AuthWrapper>
  );
}