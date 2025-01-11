'use client';
import React, { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface RatingStarsProps {
  movieId: string;
  initialRating?: number;
}

export const RatingStars: React.FC<RatingStarsProps> = ({ movieId, initialRating = 0 }) => {
  const [rating, setRating] = useState<number>(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchUserRating();
  }, [movieId]);

  const fetchUserRating = async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/movies/${movieId}/rating`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rating) {
          setUserRating(data.rating);
          setRating(data.rating);
        } else {
          setRating(initialRating);
        }
      }
    } catch (err) {
      console.error('Error fetching user rating:', err);
      setRating(initialRating);
    }
  };

  const handleRatingChange = async (newRating: number) => {
    if (!user) {
      setError('Please log in to rate movies');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ value: newRating })
      });

      if (!response.ok) {
        throw new Error('Failed to update rating');
      }

      setUserRating(newRating);
      setRating(newRating);

      // Optional: Trigger a callback to refresh the movie's average rating
      const data = await response.json();
      if (data.averageRating) {
        // You could emit this to the parent if needed
      }
    } catch (err) {
      setError('Failed to update rating');
      console.error('Rating error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => handleRatingChange(star * 2)}
          disabled={isLoading || !user}
          className={`focus:outline-none ${!user ? 'cursor-not-allowed opacity-50' : ''}`}
          title={!user ? 'Please log in to rate movies' : `Rate ${star * 2} stars`}
        >
          <Star
            className={`w-5 h-5 ${
              star * 2 <= (userRating || rating) 
                ? 'text-yellow-400 fill-yellow-400' 
                : 'text-gray-600'
            } ${
              user ? 'hover:text-yellow-400 hover:fill-yellow-400' : ''
            } transition-colors`}
          />
        </button>
      ))}
      
      {isLoading ? (
        <Loader2 className="w-4 h-4 ml-2 animate-spin text-blue-500" />
      ) : (
        <span className="ml-2 text-gray-300 font-medium">
          {userRating ? (
            <span className="text-yellow-400">{userRating.toFixed(1)}</span>
          ) : (
            rating.toFixed(1)
          )}
        </span>
      )}

      {error && (
        <span className="ml-2 text-sm text-red-500">{error}</span>
      )}
    </div>
  );
};