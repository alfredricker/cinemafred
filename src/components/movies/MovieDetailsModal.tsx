'use client';
import React, { useState, useEffect } from 'react';
import { X, Play, Star, Clock, Calendar, MessageSquare } from 'lucide-react';
import Image from 'next/image';
import { RatingStars } from './RatingStars';
import { Reviews } from './Reviews';
import { Movie } from '@/types/movie';
import { getMoviePosterUrl } from '@/lib/moviePoster';
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

  const handleRatingChange = async (newRating?: number) => {
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
      window.location.href = '/login';
      return;
    }
    // Navigate to dedicated movie page
    window.location.href = `/movie/${movieId}`;
  };

  if (!isOpen) return null;

  const renderPoster = (sizes: string) => (
    !imageError ? (
      <Image
        src={getMoviePosterUrl(movie!)}
        alt={movie!.title}
        fill
        sizes={sizes}
        quality={85}
        className="object-cover"
        onError={() => setImageError(true)}
      />
    ) : (
      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
        <span className="text-gray-400 text-sm">No Image</span>
      </div>
    )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4">
      {/* Full screen on phones, a centered card on tablets, side-by-side layout on desktop */}
      <div className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl lg:w-[70vw] lg:max-w-6xl lg:h-[56vh] lg:min-h-[33rem] lg:max-h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 sm:rounded-2xl shadow-2xl sm:border border-gray-700 overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center min-h-[16rem]">
            <div className="text-white">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center min-h-[16rem] px-4 text-center">
            <div className="text-red-400 mb-4">{error}</div>
            <button
              onClick={fetchMovieDetails}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : movie ? (
          <div className="flex flex-1 min-h-0 overflow-hidden p-4 sm:p-6 gap-6">
            {/* Movie Poster */}
            <div className="hidden lg:flex flex-shrink-0 flex-col">
              <div className="relative aspect-[27/40] w-80 overflow-hidden rounded-lg bg-gray-800">
                {renderPoster('320px')}
              </div>
            </div>

            {/* Movie Details & Reviews */}
            <div className="flex-1 flex flex-col overflow-hidden justify-between min-h-0 min-w-0">
              <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 lg:pr-2 custom-scrollbar">
                <div className="flex gap-4 mb-4">
                  {/* Compact poster next to the title on smaller screens */}
                  <div className="lg:hidden relative aspect-[27/40] w-24 sm:w-32 flex-shrink-0 overflow-hidden rounded-lg bg-gray-800">
                    {renderPoster('128px')}
                  </div>

                  <div className="min-w-0">
                    {/* Title and Year */}
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 pr-10">{movie.title}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-300">
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
                  </div>
                </div>

                {/* Description */}
                {movie.description && (
                  <div className="mb-4">
                    <p className="text-gray-300 text-sm leading-relaxed lg:line-clamp-3">
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

                {/* Sliding Container for Rating/Review and Reviews List.
                    Below lg the modal body scrolls instead, so the hidden panel is
                    collapsed to keep it from padding out the visible one. */}
                <div className="overflow-hidden lg:max-h-[280px]">
                  <div 
                    className="transition-transform duration-500 ease-in-out"
                    style={{ transform: showReviews ? 'translateX(-100%)' : 'translateX(0)' }}
                  >
                    <div className="flex w-[200%]">
                      {/* Rating & Review Submission Panel */}
                      <div className={`w-1/2 lg:pr-4 overflow-y-auto custom-scrollbar ${showReviews ? 'max-lg:h-0' : ''}`}>
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
                          {user && !user.isAdmin ? (
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
                              <div className="flex flex-wrap gap-2 mt-2">
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
                      <div className={`w-1/2 lg:pl-4 overflow-y-auto custom-scrollbar ${showReviews ? '' : 'max-lg:h-0'}`}>
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
                  className="flex items-center justify-center gap-2 w-full lg:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Play className="w-5 h-5" />
                  {user?.isGuest ? 'Sign in to watch' : 'Watch Now'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
