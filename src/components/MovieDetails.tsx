'use client';
import { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { RatingStars } from './RatingStars';
import Image from 'next/image';
import { VideoPlayer } from './VideoPlayer';
import { Movie } from '@/types/movie';

interface MovieDetailsProps {
  id: string;
}

interface Review {
  id: string;
  review_text: string | null;
  rating: number;
  created_at: string;
  user: {
    username: string;
    id: string;
  };
}

interface MovieWithDetails extends Movie {
  reviews: Review[];
  averageRating: number;
  _count: {
    ratings: number;
    reviews: number;
  };
}

export const MovieDetails: React.FC<MovieDetailsProps> = ({ id }) => {
  const [movie, setMovie] = useState<MovieWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReviews, setShowReviews] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    fetchMovieDetails();
  }, [id]);

  const fetchMovieDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/movies/${id}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch movie details');
      }

      const data = await response.json();
      setMovie(data);
    } catch (err) {
      setError('Error loading movie details. Please try again.');
      console.error('Error fetching movie details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          {error || 'Movie not found'}
        </div>
        <button
          onClick={fetchMovieDetails}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const handleWatchNow = () => {
    setIsWatching(true);
  };

  if (isWatching) {
    return (
      <div className="container mx-auto px-4 py-8">
        <VideoPlayer
          streamUrl={`/api/stream/${movie.id}`}
          poster={movie.r2_image_path}
          title={movie.title}
          movieId={movie.id}
          subtitlesUrl={movie.r2_subtitles_path ? `/api/movie/${movie.r2_subtitles_path}` : null}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-[300px,1fr] gap-8">
        <div className="relative aspect-[2/3] w-full">
          {movie.r2_image_path && !imageError ? (
            <Image
              src={movie.r2_image_path}
              alt={movie.title}
              fill
              unoptimized
              className="rounded-lg shadow-lg object-cover"
              onError={() => {
                console.error(`Failed to load image for ${movie.title}`);
                setImageError(true);
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
              <span className="text-gray-500">No image</span>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-100 mb-2">{movie.title}</h1>
          <p className="text-xl text-gray-400 mb-4">{movie.year}</p>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center">
              <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 mr-2" />
              <span className="text-2xl font-bold text-gray-100">
                {movie.averageRating ? movie.averageRating.toFixed(1) : 'N/A'}
              </span>
              <span className="text-gray-400 ml-1">/10</span>
            </div>
            <RatingStars movieId={movie.id} initialRating={movie.averageRating} />
          </div>

          <div className="flex gap-2 mb-4">
            {movie.genre.map((g) => (
              <span key={g} className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
                {g}
              </span>
            ))}
          </div>

          <p className="text-gray-300 mb-6">{movie.description}</p>

          <button
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors mb-8"
            onClick={handleWatchNow}
          >
            Watch Now
          </button>

          <div>
            <button
              className="text-blue-400 hover:text-blue-300 transition-colors"
              onClick={() => setShowReviews(!showReviews)}
            >
              {showReviews ? 'Hide Reviews' : `Show Reviews (${movie._count.reviews})`}
            </button>

            {showReviews && (
              <div className="mt-4 space-y-4">
                {movie.reviews.length > 0 ? (
                  movie.reviews.map((review) => (
                    <div key={review.id} className="bg-gray-800 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-gray-300">{review.user.username}</span>
                        <div className="flex items-center">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 mr-1" />
                          <span>{review.rating}/10</span>
                        </div>
                      </div>
                      {review.review_text && (
                        <p className="text-gray-400">{review.review_text}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400">No reviews yet. Be the first to review this movie!</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};