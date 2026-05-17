'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Movie } from '@/types/movie';
import Image from 'next/image';
import { Star, Loader2 } from 'lucide-react';

const GENRES = ['All', 'Drama', 'Sci-fi', 'Comedy', 'Horror', 'Documentary', 'Romance', 'Thriller', 'Action', 'Fantasy'];
const COLS = 5;
const PAGE_SIZE = 40;

type FocusArea = 'genres' | 'grid';

export function TVBrowse() {
  const router = useRouter();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [focusArea, setFocusArea] = useState<FocusArea>('grid');
  const [genreFocus, setGenreFocus] = useState(0);
  const [gridFocus, setGridFocus] = useState(0);

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const genreRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep a ref to current state so the keyboard handler doesn't go stale
  const stateRef = useRef({ focusArea, genreFocus, gridFocus, movies, hasMore, isLoading, page, selectedGenre });
  stateRef.current = { focusArea, genreFocus, gridFocus, movies, hasMore, isLoading, page, selectedGenre };

  const fetchMovies = useCallback(async (pageNum: number, append: boolean, genre: string | null) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE), sort: 'title-asc' });
      if (genre) params.set('genre', genre);
      const res = await fetch(`/api/movies?${params}`);
      const data = await res.json();
      setMovies(prev => append ? [...prev, ...data.movies] : data.movies);
      setHasMore(pageNum < data.pagination.pages);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load + genre change
  useEffect(() => {
    setMovies([]);
    setPage(1);
    setGridFocus(0);
    setHasMore(true);
    fetchMovies(1, false, selectedGenre);
  }, [selectedGenre, fetchMovies]);

  // Load more when near the end of loaded movies
  useEffect(() => {
    const nearEnd = movies.length > 0 && gridFocus >= movies.length - COLS * 3;
    if (nearEnd && hasMore && !isLoading) {
      const next = page + 1;
      setPage(next);
      fetchMovies(next, true, selectedGenre);
    }
  }, [gridFocus, movies.length, hasMore, isLoading, page, selectedGenre, fetchMovies]);

  // Scroll focused element into view
  useEffect(() => {
    if (focusArea === 'grid') {
      cardRefs.current[gridFocus]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      genreRefs.current[genreFocus]?.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
    }
  }, [gridFocus, genreFocus, focusArea]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const { focusArea, genreFocus, gridFocus, movies } = stateRef.current;

    if (focusArea === 'genres') {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setGenreFocus(i => Math.max(0, i - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setGenreFocus(i => Math.min(GENRES.length - 1, i + 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusArea('grid');
          break;
        case 'Enter': {
          e.preventDefault();
          const genre = GENRES[genreFocus];
          setSelectedGenre(genre === 'All' ? null : genre);
          setFocusArea('grid');
          break;
        }
        case 'Escape':
          e.preventDefault();
          setSelectedGenre(null);
          setGenreFocus(0);
          setFocusArea('grid');
          break;
      }
    } else {
      const col = gridFocus % COLS;
      const row = Math.floor(gridFocus / COLS);

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          if (col < COLS - 1 && gridFocus < movies.length - 1) {
            setGridFocus(i => i + 1);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (col > 0) setGridFocus(i => i - 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (gridFocus + COLS < movies.length) {
            setGridFocus(i => i + COLS);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (row === 0) {
            setFocusArea('genres');
          } else {
            setGridFocus(i => i - COLS);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (movies[gridFocus]) {
            router.push(`/tv/movie/${movies[gridFocus].id}`);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setFocusArea('genres');
          break;
      }
    }
  }, [router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Genre nav row */}
      <div className="flex-shrink-0 px-16 pt-10 pb-6">
        <div className="flex items-center gap-3 overflow-x-auto">
          {GENRES.map((genre, i) => {
            const isActive = selectedGenre === (genre === 'All' ? null : genre);
            const isFocused = focusArea === 'genres' && genreFocus === i;
            return (
              <button
                key={genre}
                ref={el => { genreRefs.current[i] = el; }}
                onClick={() => {
                  setGenreFocus(i);
                  setSelectedGenre(genre === 'All' ? null : genre);
                  setFocusArea('grid');
                }}
                className={`px-6 py-3 rounded-xl text-lg font-medium transition-all whitespace-nowrap outline-none ${
                  isFocused
                    ? 'bg-white text-black scale-110 shadow-lg'
                    : isActive
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Movie grid */}
      <div className="flex-1 px-16 pb-16">
        <div className="grid grid-cols-5 gap-6">
          {movies.map((movie, i) => {
            const isFocused = focusArea === 'grid' && gridFocus === i;
            const imageUrl = movie.r2_image_path ? `/api/movie/${movie.r2_image_path}` : null;
            return (
              <div
                key={movie.id}
                ref={el => { cardRefs.current[i] = el; }}
                onClick={() => router.push(`/tv/movie/${movie.id}`)}
                className={`cursor-pointer transition-all duration-150 ${
                  isFocused ? 'scale-105' : 'scale-100 opacity-70'
                }`}
              >
                <div className={`relative aspect-[27/40] rounded-xl overflow-hidden bg-gray-900 transition-all ${
                  isFocused ? 'ring-4 ring-white shadow-2xl' : ''
                }`}>
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={movie.title}
                      fill
                      sizes="20vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                      No image
                    </div>
                  )}
                </div>
                <div className={`mt-3 transition-opacity ${isFocused ? 'opacity-100' : 'opacity-60'}`}>
                  <p className="font-semibold text-white text-sm truncate">{movie.title}</p>
                  <p className="text-gray-400 text-xs">{movie.year}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    <span className="text-yellow-400 text-xs font-medium">
                      {(movie.averageRating ?? movie.rating).toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
          </div>
        )}

        {!hasMore && movies.length > 0 && !isLoading && (
          <p className="text-center text-gray-600 text-sm py-8">All movies loaded</p>
        )}
      </div>
    </div>
  );
}
