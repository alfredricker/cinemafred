// src/hooks/useRating.ts
import { useState, useEffect } from 'react';

interface RatingData {
  averageRating: number | null;
  totalRatings: number;
  userRating: number | null;
}

export function useRating(movieId: string) {
  const [ratingData, setRatingData] = useState<RatingData>({
    averageRating: null,
    totalRatings: 0,
    userRating: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRating = async () => {
    try {
      const response = await fetch(`/api/movie/${movieId}/rating`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch rating');
      }

      const data = await response.json();
      setRatingData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rating');
    } finally {
      setIsLoading(false);
    }
  };

  const submitRating = async (rating: number) => {
    try {
      const response = await fetch(`/api/movie/${movieId}/rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ rating })
      });

      if (!response.ok) {
        throw new Error('Failed to submit rating');
      }

      const data = await response.json();
      setRatingData(data);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
      return false;
    }
  };

  useEffect(() => {
    fetchRating();
  }, [movieId]);

  return {
    averageRating: ratingData.averageRating,
    totalRatings: ratingData.totalRatings,
    userRating: ratingData.userRating,
    isLoading,
    error,
    submitRating
  };
}