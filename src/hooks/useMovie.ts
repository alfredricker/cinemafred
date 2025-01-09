//src/hooks/useMovie.ts
'use client';
import { useState, useEffect } from 'react';
import { movies } from '@/data/movies';
import { Movie } from '@/types/movie';

export function useMovie(id: string) { // Change to string since Next.js route params are strings
  const [movie, setMovie] = useState<Movie | null>(null);

  useEffect(() => {
    const foundMovie = movies.find(m => m.id === Number(id));
    if (foundMovie) {
      setMovie(foundMovie);
    }
  }, [id]);

  // Rest remains the same
  const updateRating = (rating: number) => {
    if (movie) {
      setMovie({ ...movie, rating });
    }
  };

  return { movie, updateRating };
}