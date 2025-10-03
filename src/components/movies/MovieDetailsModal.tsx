'use client';
import React, { useState, useEffect } from 'react';
import { X, Play, Star, Clock, Calendar, MessageSquare } from 'lucide-react';
import Image from 'next/image';
import { RatingStars } from './RatingStars';
import { Reviews } from './Reviews';
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

interface Rating {
  id: string;
  value: number;
  created_at: string;
  user: {
    username: string;
    id: string;
  };
}

interface MovieWithDetails extends Movie {
  ratings: Rating[];
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
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [showReviews, setShowReviews] = useState(false);
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
      fetchUserReview();
    }
  }, [isOpen, movieId]);

  const fetchUserReview = async () => {
    if (!user || !movieId) return;

    try {
      const [reviewResponse, ratingResponse] = await Promise.all([
        fetch(`/api/movies/${movieId}/review`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }),
        fetch(`/api/movies/${movieId}/rate`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        })
      ]);

      if (reviewResponse.ok) {
        const data = await reviewResponse.json();
        if (data.review) {
          setReviewText(data.reviewText || '');
        }
      }

      if (ratingResponse.ok) {
        const data = await ratingResponse.json();
        setUserRating(data.rating);
      }
    } catch (err) {
      console.error('Error fetching user review:', err);
    }
  };

  const handleSubmitReview = async () => {
    if (!user) {
      setReviewError('Please log in to submit a review');
      return;
    }

    if (!userRating || userRating === 0) {
      setReviewError('Please rate the movie before submitting a review');
      return;
    }

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const response = await fetch(`/api/movies/${movieId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ 
          reviewText: reviewText.trim(),
          rating: userRating
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit review');
      }

      // Refetch movie details to show updated reviews
      await fetchMovieDetails();
      setReviewError(null);
    } catch (err) {
      setReviewError('Failed to submit review. Please try again.');
      console.error('Error submitting review:', err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleRatingChange = async () => {
    // Fetch the updated rating after user rates
    if (!user || !movieId) return;
    
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserRating(data.rating);
      }
    } catch (err) {
      console.error('Error fetching updated rating:', err);
    }
  };

  const handleWatchClick = () => {
    if (user?.isGuest) {
      // Could redirect to login or show login modal
      return;
    }
    // Navigate to dedicated movie page
    window.location.href = `/movie/${movieId}`;
  };

  const getOptimizedImageUrl = (path: string) => {
    // Use the organized path directly (database stores: images/filename.jpg)
    return `/api/movie/${path}?format=webp`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-[70vw] max-w-6xl h-[56vh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
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
          <div className="flex h-full overflow-hidden p-6 gap-6">
            {/* Movie Poster */}
            <div className="flex-shrink-0 flex flex-col">
              <div className="relative aspect-[27/40] w-80 overflow-hidden rounded-lg bg-gray-800">
                {movie.r2_image_path && !imageError ? (
                  <Image
                    src={getOptimizedImageUrl(movie.r2_image_path)}
                    alt={movie.title}
                    fill
                    quality={85}
                    className="object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">No Image</span>
                  </div>
                )}
              </div>
            </div>

            {/* Movie Details & Reviews */}
            <div className="flex-1 flex flex-col overflow-hidden justify-between min-h-0">
              <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
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
                  <div className="mb-4">
                    <p className="text-gray-300 text-sm leading-relaxed overflow-hidden" 
                       style={{
                         display: '-webkit-box',
                         WebkitLineClamp: 3,
                         WebkitBoxOrient: 'vertical'
                       }}>
                      {movie.description}
                    </p>
                  </div>
                )}

                {/* Genres */}
                {movie.genre && movie.genre.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2">
                      {movie.genre.map((genre: string, index: number) => (
                        <span 
                          key={index}
                          className="inline-block px-3 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-600/30"
                        >
                          {genre.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sliding Container for Rating/Review and Reviews List */}
                <div className="overflow-hidden max-h-[280px]">
                  <div 
                    className="transition-transform duration-500 ease-in-out"
                    style={{ transform: showReviews ? 'translateX(-100%)' : 'translateX(0)' }}
                  >
                    <div className="flex w-[200%]">
                      {/* Rating & Review Submission Panel */}
                      <div className="w-1/2 pr-4 overflow-y-auto custom-scrollbar">
                        {/* Rating Component */}
                        <div className="mb-4">
                          <RatingStars
                            movieId={movie.id}
                            initialRating={movie.averageRating}
                            onRatingChange={handleRatingChange}
                          />
                        </div>

                        {/* Review Submission */}
                        <div className="mb-4">
                          {user ? (
                            <>
                              <textarea
                                value={reviewText}
                                onChange={(e) => setReviewText(e.target.value)}
                                placeholder="Share your thoughts about this movie..."
                                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-gray-300 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={3}
                              />
                              {reviewError && (
                                <p className="text-red-400 text-xs mt-1">{reviewError}</p>
                              )}
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={handleSubmitReview}
                                  disabled={isSubmittingReview || !reviewText.trim()}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors"
                                >
                                  {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
                                </button>
                                <button
                                  onClick={() => setShowReviews(true)}
                                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                  See Reviews ({movie._count.ratings})
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              onClick={() => setShowReviews(true)}
                              className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                              <MessageSquare className="w-4 h-4" />
                              See Reviews ({movie._count.ratings})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reviews List Panel */}
                      <div className="w-1/2 pl-4 overflow-y-auto custom-scrollbar">
                        <div className="mb-3 flex align-left">
                          <button
                            onClick={() => setShowReviews(false)}
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            ← Back
                          </button>
                        </div>
                        <Reviews ratings={movie.ratings} reviews={movie.reviews} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons - Pinned to Bottom */}
              <div className="flex-shrink-0 pt-3 border-t border-gray-600">
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
