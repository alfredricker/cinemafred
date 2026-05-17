'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { Movie } from '@/types/movie';
import { TVPlayer } from '@/components/tv/TVPlayer';

export default function TVWatchPage() {
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
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
      </div>
    );
  }

  if (!movie) return null;

  const useHLS = Boolean(movie.hls_ready && movie.r2_hls_path);
  const streamUrl = useHLS ? `/api/hls/${id}` : `/api/stream/${id}`;

  return (
    <TVPlayer
      movieId={id}
      title={movie.title}
      streamUrl={streamUrl}
      poster={movie.r2_image_path ? `/api/movie/${movie.r2_image_path}` : undefined}
      subtitlesUrl={movie.r2_subtitles_path ? `/api/movie/${movie.r2_subtitles_path}` : undefined}
      useHLS={useHLS}
      onBack={() => router.push(`/tv/movie/${id}`)}
    />
  );
}
