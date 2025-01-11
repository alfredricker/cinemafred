'use client';
import { useState, useEffect } from 'react';
import { Movie } from '@/types/movie';
import { useAuth } from '@/context/AuthContext';

export function useMovie(id: string) {
  const [movie, setMovie] = useState<Movie | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchMovie();
  }, [id]);

  const fetchMovie = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/movies/${id}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch movie');
      }
      
      const data = await response.json();
      setMovie(data);
    } catch (err) {
      setError('Error loading movie');
      console.error('Error in useMovie:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateRating = async (rating: number) => {
    if (!movie || !user) return;

    try {
      const response = await fetch(`/api/movies/${id}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ rating })
      });

      if (!response.ok) {
        throw new Error('Failed to update rating');
      }

      // Refetch the movie to get updated ratings
      await fetchMovie();
    } catch (err) {
      console.error('Error updating rating:', err);
      throw err;
    }
  };

  const submitReview = async (reviewText: string, rating: number) => {
    if (!movie || !user) return;

    try {
      const response = await fetch(`/api/movies/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ reviewText, rating })
      });

      if (!response.ok) {
        throw new Error('Failed to submit review');
      }

      // Refetch the movie to get updated reviews
      await fetchMovie();
    } catch (err) {
      console.error('Error submitting review:', err);
      throw err;
    }
  };

  return {
    movie,
    isLoading,
    error,
    updateRating,
    submitReview,
    refetch: fetchMovie
  };
}