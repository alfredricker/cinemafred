'use client';
import React, { useState, useEffect } from 'react';
import { X, Play, Star, Clock, Calendar } from 'lucide-react';
import Image from 'next/image';
import { RatingStars } from './RatingStars';
import { Movie } from '@/types/movie';
import { useAuth } from '@/context/AuthContext';

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

interface MovieDetailsModalProps {
  movieId: string;
  isOpen: boolean;
  onClose: () => void;
  onWatchNow: (movieId: string) => void;
}

export const MovieDetailsModal: React.FC<MovieDetailsModalProps> = ({
  movieId,
  isOpen,
  onClose,
  onWatchNow
}) => {
  const [movie, setMovie] = useState<MovieWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const { user } = useAuth();

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const fetchMovieDetails = async () => {
    if (!movieId) return;
    
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
      setError('Error loading movie details. Please try again.');
      console.error('Error fetching movie details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && movieId) {
      fetchMovieDetails();
    }
  }, [isOpen, movieId]);

  const handleWatchClick = () => {
    if (user?.isGuest) {
      // Could redirect to login or show login modal
      return;
    }
    onWatchNow(movieId);
  };

  const getOptimizedImageUrl = (path: string) => {
    const basePath = path.replace(/^api\/movie\//, '');
    return `/api/image/${basePath}?width=400&quality=95`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[70vw] h-[60vh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-white">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-red-400 mb-4">{error}</div>
            <button
              onClick={fetchMovieDetails}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : movie ? (
          <div className="flex h-full">
            {/* Movie Poster */}
            <div className="w-1/3 relative">
              {movie.r2_image_path && !imageError ? (
                <Image
                  src={movie.r2_image_path.startsWith('/') ? movie.r2_image_path : `/${movie.r2_image_path}`}
                  alt={movie.title}
                  fill
                  className="object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <span className="text-gray-400 text-sm">No Image</span>
                </div>
              )}
            </div>

            {/* Movie Details */}
            <div className="flex-1 p-6 flex flex-col justify-between">
              <div>
                {/* Title and Year */}
                <h2 className="text-3xl font-bold text-white mb-2">{movie.title}</h2>
                <div className="flex items-center gap-4 text-gray-300 mb-4">
                  {movie.year && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{movie.year}</span>
                    </div>
                  )}
                  {movie.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatDuration(movie.duration)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span>{movie.averageRating ? movie.averageRating.toFixed(1) : 'N/A'}</span>
                    <span className="text-gray-400">({movie._count.ratings} ratings)</span>
                  </div>
                </div>

                {/* Description */}
                {movie.description && (
                  <div className="mb-6">
                    <p className="text-gray-300 text-sm leading-relaxed overflow-hidden" 
                       style={{
                         display: '-webkit-box',
                         WebkitLineClamp: 4,
                         WebkitBoxOrient: 'vertical'
                       }}>
                      {movie.description}
                    </p>
                  </div>
                )}

                {/* Rating Component */}
                <div className="mb-6">
                  <RatingStars
                    movieId={movie.id}
                    initialRating={movie.averageRating}
                  />
                </div>

                {/* Genres */}
                {movie.genre && (
                  <div className="mb-6">
                    <span className="inline-block px-3 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-600/30">
                      {movie.genre}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleWatchClick}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Play className="w-5 h-5" />
                  Watch Now
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
