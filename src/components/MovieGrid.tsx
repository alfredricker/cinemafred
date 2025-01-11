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
  limit = 20 
}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchMovies();
  }, [currentPage]);

  const fetchMovies = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/movies?page=${currentPage}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch movies');
      }

      const data: MovieResponse = await response.json();
      setMovies(data.movies);
      setTotalPages(data.pagination.pages);
    } catch (err) {
      setError('Error loading movies. Please try again.');
      console.error('Error fetching movies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">{error}</div>
        <button
          onClick={fetchMovies}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
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