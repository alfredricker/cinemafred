import React, { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface RatingStarsProps {
  movieId: string;
  initialRating?: number;
  onRatingChange?: () => void;
}

export const RatingStars: React.FC<RatingStarsProps> = ({ movieId, initialRating = 0, onRatingChange }) => {
  const [rating, setRating] = useState<number>(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchUserRating();
  }, [movieId]);

  const fetchUserRating = async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rating !== null) {
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
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ value: newRating }),
      });

      if (!response.ok) {
        throw new Error('Failed to update rating');
      }

      setUserRating(newRating);
      setRating(newRating);

      const data = await response.json();
      if (data.averageRating) {
        // Available for parent component if needed
      }

      // Notify parent component that rating changed
      if (onRatingChange) {
        onRatingChange();
      }
    } catch (err) {
      setError('Failed to update rating');
      console.error('Rating error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateRating = (index: number, clientX: number, target: HTMLElement) => {
    const { left, width } = target.getBoundingClientRect();
    const offsetX = clientX - left;
    const fraction = offsetX / width;
    return index + (fraction > 0.5 ? 1 : 0.5);
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex gap-1"
        onMouseLeave={() => setHoverRating(null)}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              const newRating = calculateRating(i, e.clientX, e.currentTarget);
              handleRatingChange(newRating);
            }}
            onMouseMove={(e) => {
              const hoverValue = calculateRating(i, e.clientX, e.currentTarget);
              setHoverRating(hoverValue);
            }}
            className="focus:outline-none"
            disabled={isLoading || !user}
            title={!user ? 'Please log in to rate movies' : `Rate ${(i + 1)}`}
          >
            <Star
              className={`w-6 h-6 ${
                (hoverRating || userRating || rating) >= i + 1
                  ? 'text-yellow-400 fill-yellow-400'
                  : (hoverRating || userRating || rating) >= i + 0.5
                  ? 'text-yellow-400 half-filled'
                  : 'text-gray-600'
              } ${user ? 'hover:text-yellow-400 hover:fill-yellow-400' : ''} transition-colors`}
            />
          </button>
        ))}
      </div>

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

export default RatingStars;
