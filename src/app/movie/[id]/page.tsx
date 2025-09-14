'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { VideoPlayer } from '@/components/stream/VideoPlayer';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { Movie } from '@/types/movie';

export default function MoviePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const movieId = params.id as string;

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/login');
      return;
    }

    fetchMovieDetails();
  }, [movieId, user, authLoading]);

  const fetchMovieDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/movies/${movieId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch movie details');
      }

      const data = await response.json();
      setMovie(data);
    } catch (err) {
      setError('Error loading movie. Please try again.');
      console.error('Error fetching movie details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    router.push('/');
  };

  if (authLoading || isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
        <div className="text-red-400 mb-4">{error || 'Movie not found'}</div>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  // Construct subtitle URL if available
  const subtitlesUrl = movie.r2_subtitles_path 
    ? `/api/movie/${movie.r2_subtitles_path.split('/').pop()}`
    : undefined;

  return (
    <VideoPlayer
      streamUrl={`/api/stream/${movieId}`}
      poster={movie.r2_image_path ? `/api/movie/${movie.r2_image_path.split('/').pop()}` : undefined}
      title={movie.title}
      movieId={movieId}
      subtitlesUrl={subtitlesUrl}
      isAdmin={user?.isAdmin}
      onClose={handleClose}
    />
  );
}
