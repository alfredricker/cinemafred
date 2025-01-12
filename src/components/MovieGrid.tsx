'use client';
import { useState, useEffect } from 'react';
import { MovieCard } from './MovieCard';
import { Loader2 } from 'lucide-react';
import { Movie } from '@/types/movie';

interface MovieGridProps {
  initialPage?: number;
  limit?: number;
}

interface MovieResponse {
  movies: Movie[];
  pagination: {
    total: number;
    pages: number;
    currentPage: number;
    limit: number;
  };
}

export const MovieGrid: React.FC<MovieGridProps> = ({ 
  initialPage = 1,
  limit = 24
}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchMovies();
  }, []); // Only fetch on initial mount

  const fetchMovies = async (page = currentPage) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/movies?page=${page}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch movies');
      }

      const data: MovieResponse = await response.json();
      
      // Append new movies instead of replacing them
      setMovies(prevMovies => {
        // If it's the first page, replace everything
        if (page === 1) {
          return data.movies;
        }
        // Otherwise, append new movies
        return [...prevMovies, ...data.movies];
      });
      
      setTotalPages(data.pagination.pages);
    } catch (err) {
      setError('Error loading movies. Please try again.');
      console.error('Error fetching movies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (currentPage < totalPages && !isLoading) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      await fetchMovies(nextPage);
    }
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">{error}</div>
        <button
          onClick={() => fetchMovies(1)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-5">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {!isLoading && currentPage < totalPages && (
        <div className="flex justify-center py-8">
          <button
            onClick={handleLoadMore}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                     transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
};