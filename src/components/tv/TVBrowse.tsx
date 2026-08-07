'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Movie } from '@/types/movie';
import Image from 'next/image';
import { Star, Loader2, Film, ArrowUpDown, Search, X } from 'lucide-react';
import { generateRandomSeed } from '@/lib/randomSeed';
import { fetchCachedJson } from '@/lib/browserCache';
import { getMoviePosterUrl } from '@/lib/moviePoster';

const GENRES = ['All', 'Drama', 'Sci-fi', 'Comedy', 'Horror', 'Documentary', 'Romance', 'Thriller', 'Action', 'Fantasy'];
const SORT_OPTIONS = [
  { value: 'title-asc',     label: 'Title: A–Z' },
  { value: 'title-desc',    label: 'Title: Z–A' },
  { value: 'created-desc',  label: 'Recently Added' },
  { value: 'rating-desc',   label: 'Rating: High–Low' },
  { value: 'rating-asc',    label: 'Rating: Low–High' },
  { value: 'year-desc',     label: 'Year: New–Old' },
  { value: 'year-asc',      label: 'Year: Old–New' },
  { value: 'random',        label: 'Random' },
] as const;

const COLS = 5;
const PAGE_SIZE = 40;

type FocusArea = 'nav' | 'grid';
type ModalType = 'genres' | 'sort' | 'search' | null;

interface CachedBrowseState {
  movies: Movie[];
  page: number;
  hasMore: boolean;
  selectedGenre: string | null;
  sortOption: string;
  searchQuery: string;
  gridFocus: number;
  randomSeed: string;
}

// Module-level cache so returning from a movie detail page restores exactly
// where the user left off, without a full refetch/scroll-to-top.
let cachedBrowseState: CachedBrowseState | null = null;

export function TVBrowse() {
  const router = useRouter();

  // Pop the cache exactly once, on the first render of this mount.
  const restoredRef = useRef<CachedBrowseState | null | undefined>(undefined);
  if (restoredRef.current === undefined) {
    restoredRef.current = cachedBrowseState;
    cachedBrowseState = null;
  }
  const restored = restoredRef.current;

  const [movies, setMovies] = useState<Movie[]>(() => restored?.movies ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(() => restored?.page ?? 1);
  const [hasMore, setHasMore] = useState(() => restored?.hasMore ?? true);

  const [selectedGenre, setSelectedGenre] = useState<string | null>(() => restored?.selectedGenre ?? null);
  const [sortOption, setSortOption] = useState(() => restored?.sortOption ?? 'title-asc');
  const [searchQuery, setSearchQuery] = useState(() => restored?.searchQuery ?? '');

  const [focusArea, setFocusArea] = useState<FocusArea>('grid');
  const [navFocus, setNavFocus] = useState(0); // 0=Genres 1=Sort 2=Search
  const [gridFocus, setGridFocus] = useState(() => restored?.gridFocus ?? 0);

  // Skip the initial fetch-reset effect when we just restored cached movies.
  const skipNextResetRef = useRef(restored !== null);

  // Seed for "random" sort. Stable across pagination (same seed -> same
  // shuffle order); only regenerated when the user (re)selects random sort.
  const seedRef = useRef(restored?.randomSeed ?? '');

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalFocus, setModalFocus] = useState(0);

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Single ref for the keyboard handler to read without going stale
  const S = useRef({ focusArea, navFocus, gridFocus, movies, hasMore, isLoading, page, selectedGenre, sortOption, searchQuery, activeModal, modalFocus });
  S.current = { focusArea, navFocus, gridFocus, movies, hasMore, isLoading, page, selectedGenre, sortOption, searchQuery, activeModal, modalFocus };

  // ── Fetching ────────────────────────────────────────────────────────────────

  const fetchMovies = useCallback(async (pageNum: number, append: boolean, genre: string | null, sort: string, search: string) => {
    setIsLoading(true);
    try {
      const p = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE), sort });
      if (genre) p.set('genre', genre);
      if (search.trim()) p.set('search', search.trim());
      if (sort === 'random') p.set('seed', seedRef.current);
      const data = await fetchCachedJson<{ movies: Movie[]; pagination: { pages: number } }>(`/api/movies?${p}`);
      setMovies(prev => append ? [...prev, ...data.movies] : data.movies);
      setHasMore(pageNum < data.pagination.pages);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }
    if (sortOption === 'random') seedRef.current = generateRandomSeed();
    setMovies([]);
    setPage(1);
    setGridFocus(0);
    setHasMore(true);
    fetchMovies(1, false, selectedGenre, sortOption, searchQuery);
  }, [selectedGenre, sortOption, searchQuery, fetchMovies]);

  useEffect(() => {
    const nearEnd = movies.length > 0 && gridFocus >= movies.length - COLS * 3;
    if (nearEnd && hasMore && !isLoading) {
      const next = page + 1;
      setPage(next);
      fetchMovies(next, true, selectedGenre, sortOption, searchQuery);
    }
  }, [gridFocus, movies.length, hasMore, isLoading, page, selectedGenre, sortOption, searchQuery, fetchMovies]);

  // ── Scroll into view ────────────────────────────────────────────────────────

  const firstScrollRef = useRef(true);
  useEffect(() => {
    if (focusArea === 'grid') {
      const behavior = firstScrollRef.current ? 'auto' : 'smooth';
      firstScrollRef.current = false;
      cardRefs.current[gridFocus]?.scrollIntoView({ block: 'center', behavior });
    }
  }, [gridFocus, focusArea]);

  // Save current browse state and navigate to a movie's detail page, so
  // hitting back restores the grid/scroll position instead of resetting.
  const goToMovie = useCallback((movieId: string) => {
    const s = S.current;
    cachedBrowseState = {
      movies: s.movies,
      page: s.page,
      hasMore: s.hasMore,
      selectedGenre: s.selectedGenre,
      sortOption: s.sortOption,
      searchQuery: s.searchQuery,
      gridFocus: s.gridFocus,
      randomSeed: seedRef.current,
    };
    router.push(`/tv/movie/${movieId}`);
  }, [router]);

  // Focus the search input when the search modal opens
  useEffect(() => {
    if (activeModal === 'search') {
      // Brief delay so the element is painted before we focus
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [activeModal]);

  // ── Keyboard handler ────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const s = S.current;

    // ── Modal open ──────────────────────────────────────────────────────────
    if (s.activeModal === 'genres') {
      switch (e.key) {
        case 'ArrowUp':   e.preventDefault(); setModalFocus(i => Math.max(0, i - 1)); break;
        case 'ArrowDown': e.preventDefault(); setModalFocus(i => Math.min(GENRES.length - 1, i + 1)); break;
        case 'Enter': {
          e.preventDefault();
          const g = GENRES[s.modalFocus];
          setSelectedGenre(g === 'All' ? null : g);
          setActiveModal(null);
          setFocusArea('grid');
          break;
        }
        case 'Escape': e.preventDefault(); setActiveModal(null); break;
      }
      return;
    }

    if (s.activeModal === 'sort') {
      switch (e.key) {
        case 'ArrowUp':   e.preventDefault(); setModalFocus(i => Math.max(0, i - 1)); break;
        case 'ArrowDown': e.preventDefault(); setModalFocus(i => Math.min(SORT_OPTIONS.length - 1, i + 1)); break;
        case 'Enter': {
          e.preventDefault();
          setSortOption(SORT_OPTIONS[s.modalFocus].value);
          setActiveModal(null);
          setFocusArea('grid');
          break;
        }
        case 'Escape': e.preventDefault(); setActiveModal(null); break;
      }
      return;
    }

    if (s.activeModal === 'search') {
      // Arrow keys and Enter belong to the text input; only intercept Escape
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        setActiveModal(null);
        setFocusArea('grid');
      }
      return;
    }

    // ── Nav bar ─────────────────────────────────────────────────────────────
    if (s.focusArea === 'nav') {
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); setNavFocus(i => Math.max(0, i - 1)); break;
        case 'ArrowRight': e.preventDefault(); setNavFocus(i => Math.min(2, i + 1)); break;
        case 'ArrowDown':  e.preventDefault(); setFocusArea('grid'); break;
        case 'Enter': {
          e.preventDefault();
          const modal: ModalType = s.navFocus === 0 ? 'genres' : s.navFocus === 1 ? 'sort' : 'search';
          // Pre-select the modal's focus to the current value
          if (modal === 'genres') {
            const idx = GENRES.findIndex(g => (g === 'All' ? null : g) === s.selectedGenre);
            setModalFocus(idx >= 0 ? idx : 0);
          } else if (modal === 'sort') {
            const idx = SORT_OPTIONS.findIndex(o => o.value === s.sortOption);
            setModalFocus(idx >= 0 ? idx : 0);
          }
          setActiveModal(modal);
          break;
        }
        case 'Escape': e.preventDefault(); setFocusArea('grid'); break;
      }
      return;
    }

    // ── Grid ────────────────────────────────────────────────────────────────
    const col = s.gridFocus % COLS;
    const row = Math.floor(s.gridFocus / COLS);
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        if (col < COLS - 1 && s.gridFocus < s.movies.length - 1) setGridFocus(i => i + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (col > 0) setGridFocus(i => i - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (s.gridFocus + COLS < s.movies.length) setGridFocus(i => i + COLS);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (row === 0) setFocusArea('nav');
        else setGridFocus(i => i - COLS);
        break;
      case 'Enter':
        e.preventDefault();
        if (s.movies[s.gridFocus]) goToMovie(s.movies[s.gridFocus].id);
        break;
      case 'Escape':
        e.preventDefault();
        setFocusArea('nav');
        break;
    }
  }, [goToMovie]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Derived display values ──────────────────────────────────────────────────

  const sortLabel = SORT_OPTIONS.find(o => o.value === sortOption)?.label ?? 'Sort';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black flex flex-col">

      {/* ── Top nav bar ── */}
      <div className="flex-shrink-0 px-16 pt-10 pb-6 flex items-center gap-4">
        <NavBtn
          icon={<Film className="w-5 h-5" />}
          label="Genres"
          value={selectedGenre ?? 'All'}
          active={selectedGenre !== null}
          focused={focusArea === 'nav' && navFocus === 0}
          onClick={() => { setNavFocus(0); setFocusArea('nav'); }}
        />
        <NavBtn
          icon={<ArrowUpDown className="w-5 h-5" />}
          label="Sort"
          value={sortLabel}
          active={sortOption !== 'title-asc'}
          focused={focusArea === 'nav' && navFocus === 1}
          onClick={() => { setNavFocus(1); setFocusArea('nav'); }}
        />
        <NavBtn
          icon={<Search className="w-5 h-5" />}
          label="Search"
          value={searchQuery || 'All movies'}
          active={searchQuery.length > 0}
          focused={focusArea === 'nav' && navFocus === 2}
          onClick={() => { setNavFocus(2); setFocusArea('nav'); }}
        />
      </div>

      {/* ── Movie grid ── */}
      <div className="flex-1 px-16 pb-16">
        <div className="grid grid-cols-5 gap-6">
          {movies.map((movie, i) => {
            const isFocused = focusArea === 'grid' && gridFocus === i;
            const imageUrl = getMoviePosterUrl(movie);
            return (
              <div
                key={movie.id}
                ref={el => { cardRefs.current[i] = el; }}
                onClick={() => goToMovie(movie.id)}
                className={`cursor-pointer transition-all duration-150 ${isFocused ? 'scale-105' : 'scale-100 opacity-70'}`}
              >
                <div className={`relative aspect-[27/40] rounded-xl overflow-hidden bg-gray-900 ${isFocused ? 'ring-4 ring-white shadow-2xl' : ''}`}>
                  <Image src={imageUrl} alt={movie.title} fill sizes="20vw" className="object-cover" />
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

      {/* ── Modals ── */}

      {activeModal === 'genres' && (
        <TVModal title="Genres" onClose={() => setActiveModal(null)}>
          {GENRES.map((genre, i) => {
            const value = genre === 'All' ? null : genre;
            return (
              <ModalRow
                key={genre}
                label={genre}
                focused={modalFocus === i}
                selected={selectedGenre === value}
                onHover={() => setModalFocus(i)}
                onSelect={() => {
                  setSelectedGenre(value);
                  setActiveModal(null);
                  setFocusArea('grid');
                }}
              />
            );
          })}
        </TVModal>
      )}

      {activeModal === 'sort' && (
        <TVModal title="Sort By" onClose={() => setActiveModal(null)}>
          {SORT_OPTIONS.map((opt, i) => (
            <ModalRow
              key={opt.value}
              label={opt.label}
              focused={modalFocus === i}
              selected={sortOption === opt.value}
              onHover={() => setModalFocus(i)}
              onSelect={() => {
                setSortOption(opt.value);
                setActiveModal(null);
                setFocusArea('grid');
              }}
            />
          ))}
        </TVModal>
      )}

      {activeModal === 'search' && (
        <TVModal title="Search" onClose={() => { setActiveModal(null); setFocusArea('grid'); }}>
          <div className="space-y-4">
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Type to search…"
              className="w-full px-6 py-4 text-xl bg-gray-800 border-2 border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-lg"
              >
                <X className="w-5 h-5" />
                Clear
              </button>
            )}
          </div>
        </TVModal>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavBtn({ icon, label, value, active, focused, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  active: boolean;
  focused: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-7 py-4 rounded-2xl transition-all outline-none ${
        focused
          ? 'bg-white text-black scale-105 shadow-xl'
          : active
          ? 'bg-gray-700 text-white'
          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      {icon}
      <div className="text-left leading-tight">
        <div className="text-xs font-semibold uppercase tracking-wider opacity-60">{label}</div>
        <div className="text-base font-semibold truncate max-w-[14ch]">{value}</div>
      </div>
    </button>
  );
}

function TVModal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
          <h2 className="text-white text-2xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-3">
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalRow({ label, focused, selected, onHover, onSelect }: {
  label: string;
  focused: boolean;
  selected: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);

  return (
    <button
      ref={ref}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full text-left px-5 py-4 rounded-xl text-xl transition-all outline-none flex items-center justify-between ${
        focused   ? 'bg-white text-black' :
        selected  ? 'bg-gray-800 text-white' :
                    'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      {label}
      {selected && (
        <span className={`text-sm font-bold ${focused ? 'text-gray-600' : 'text-blue-400'}`}>✓</span>
      )}
    </button>
  );
}
