import { useState, useEffect, useRef } from 'react';
import { MovieCard } from './MovieCard';
import { Loader2 } from 'lucide-react';
import { Movie } from '@/types/movie';

interface MovieGridProps {
  selectedGenre: string | null;
  sortOption: string;
  searchQuery?: string;
  onMovieClick?: (movieId: string) => void;
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
  selectedGenre, 
  sortOption,
  searchQuery = '',
  onMovieClick
}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Fetch movies for a specific page
  const fetchMovies = async (pageNum: number, append = true) => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '30',
        sort: sortOption
      });

      if (selectedGenre) {
        params.append('genre', selectedGenre);
      }

      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const response = await fetch(`/api/movies?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch movies');

      const data: MovieResponse = await response.json();
      
      setMovies(prev => append ? [...prev, ...data.movies] : data.movies);
      setHasMore(pageNum < data.pagination.pages);
      
    } catch (err) {
      setError('Error loading movies. Please try again.');
      console.error('Error fetching movies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset and fetch initial page when filters change
  useEffect(() => {
    setMovies([]);
    setPage(1);
    setHasMore(true);
    fetchMovies(1, false);
  }, [selectedGenre, sortOption, searchQuery]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchMovies(nextPage, true);
        }
      },
      { 
        rootMargin: '200px', // Start loading 200px before reaching the trigger
        threshold: 0.1 
      }
    );

    observer.observe(loadMoreRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoading, page]);

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">{error}</div>
        <button
          onClick={() => fetchMovies(1, false)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-3 md:gap-5">
        {movies.map((movie) => (
          <MovieCard 
            key={movie.id} 
            movie={movie} 
            onMovieClick={onMovieClick}
          />
        ))}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {/* Intersection observer trigger - invisible div at bottom */}
      {hasMore && !isLoading && (
        <div ref={loadMoreRef} className="h-20" />
      )}

      {/* End of results indicator */}
      {!hasMore && movies.length > 0 && (
        <div className="text-center text-gray-400 text-sm py-8">
          All movies loaded
        </div>
      )}
    </div>
  );
};