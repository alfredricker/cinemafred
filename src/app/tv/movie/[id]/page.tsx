'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { Movie } from '@/types/movie';
import { TVMovieDetail } from '@/components/tv/TVMovieDetail';

export default function TVMoviePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/tv/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || authLoading) return;
    fetch(`/api/movies/${id}`)
      .then(r => r.json())
      .then(setMovie)
      .finally(() => setIsLoading(false));
  }, [id, user, authLoading]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <p className="text-red-400 text-3xl">Movie not found</p>
        <button onClick={() => router.push('/tv/browse')} className="text-white text-2xl underline">
          Back to Browse
        </button>
      </div>
    );
  }

  return (
    <TVMovieDetail
      movie={movie}
      onBack={() => router.push('/tv/browse')}
      onPlay={() => router.push(`/tv/watch/${id}`)}
    />
  );
}
