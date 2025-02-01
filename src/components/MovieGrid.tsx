import { useState, useEffect } from 'react';
import { MovieCard } from './MovieCard';
import { Loader2 } from 'lucide-react';
import { Movie } from '@/types/movie';

interface MovieGridProps {
  initialPage?: number;
  selectedGenre: string | null;
  sortOption: string;
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
  selectedGenre,
  sortOption
}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [limit, setLimit] = useState(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      if (width >= 3000) return 54;
      if (width >= 1680) return 42;
      if (width >= 1024) return 36;
      if (width >= 768) return 30;
      return 24;
    }
    return 30;
  });

  const calculateLimit = () => {
    const width = window.innerWidth;
    if (width >= 3000) return 54;      // 2xl screens
    if (width >= 1680) return 42;      // xl screens
    if (width >= 1024) return 36;      // lg screens
    if (width >= 768) return 30;       // md screens
    return 24;                         // sm/xs screens
  };

  useEffect(() => {
    const handleResize = () => {
      const newLimit = calculateLimit();
      if (newLimit !== limit) {
        setLimit(newLimit);
        setMovies([]); // Clear existing movies when limit changes
        setCurrentPage(1); // Reset to first page
      }
    };

    // Initial calculation
    handleResize();

    // Debounced resize handler
    let timeoutId: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 250);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Reset page when filters or sort change
  useEffect(() => {
    setMovies([]);
    setCurrentPage(1);
    fetchMovies(1);
  }, [selectedGenre, sortOption]);

  const fetchMovies = async (page: number) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Build the query string with all parameters
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort: sortOption
      });

      if (selectedGenre) {
        params.append('genre', selectedGenre);
      }

      const response = await fetch(`/api/movies?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch movies');
      }

      const data: MovieResponse = await response.json();
      
      setMovies(prevMovies => {
        return page === 1 ? data.movies : [...prevMovies, ...data.movies];
      });
      
      setTotalPages(data.pagination.pages);
      setCurrentPage(page);
    } catch (err) {
      setError('Error loading movies. Please try again.');
      console.error('Error fetching movies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies(1);
  }, [limit]);

  const handleLoadMore = () => {
    if (currentPage < totalPages && !isLoading) {
      fetchMovies(currentPage + 1);
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-3 md:gap-5">
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