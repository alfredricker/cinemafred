//src/app/movie/[id]/page.tsx
'use client';
import { MovieDetails } from '@/components/MovieDetails';
import { Header } from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';

interface MovieDetailsProps {
    id: string;
  }

export default function MoviePage({ params }: { params: { id: string } }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <Header />
      <main className="max-w-7xl mx-auto py-8">
        <MovieDetails id={params.id} />
      </main>
    </div>
  );
}