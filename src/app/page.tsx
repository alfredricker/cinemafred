'use client';
import { Header } from '@/components/Header';
import { MovieGridHeader } from '@/components/movies/MovieGridHeader';
import { MovieGrid } from '@/components/movies/MovieGrid';
import { MovieDetailsModal } from '@/components/movies/MovieDetailsModal';
import { useAuth } from '@/context/AuthContext';
import { redirect, useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';

function HomeContent() {
  const { user, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initialize state from URL params
  const [selectedGenre, setSelectedGenre] = useState<string | null>(searchParams.get('genre'));
  const [sortOption, setSortOption] = useState(searchParams.get('sort') || 'title-asc');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('query') || '');
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    redirect('/login');
  }

  // Mark as initialized after first render
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Update URL when state changes (but not on initial load)
  useEffect(() => {
    if (!isInitialized) return;

    const params = new URLSearchParams();
    
    if (selectedGenre) {
      params.set('genre', selectedGenre);
    }
    
    if (sortOption !== 'title-asc') {
      params.set('sort', sortOption);
    }
    
    if (searchQuery.trim()) {
      params.set('query', searchQuery.trim());
    }

    const queryString = params.toString();
    const newUrl = queryString ? `/?${queryString}` : '/';
    
    // Only update if URL actually changed
    if (window.location.pathname + window.location.search !== newUrl) {
      router.push(newUrl, { scroll: false });
    }
  }, [selectedGenre, sortOption, searchQuery, isInitialized, router]);

  const handleGenreSelect = (genre: string | null) => {
    setSelectedGenre(genre);
  };

  const handleSortChange = (option: string) => {
    setSortOption(option);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleMovieClick = (movieId: string) => {
    setSelectedMovieId(movieId);
  };

  const handleCloseModal = () => {
    setSelectedMovieId(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <Header />
      
      <MovieGridHeader
        onGenreSelect={handleGenreSelect}
        onSortChange={handleSortChange}
        selectedGenre={selectedGenre}
        selectedSort={sortOption}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />
      <main className="px-16">
        <div className="max-w-[128rem] mx-auto pt-8 pb-16">
          <MovieGrid 
            selectedGenre={selectedGenre}
            sortOption={sortOption}
            searchQuery={searchQuery}
            onMovieClick={handleMovieClick}
          />
        </div>
      </main>

      {/* Movie Details Modal */}
      {selectedMovieId && (
        <MovieDetailsModal
          movieId={selectedMovieId}
          isOpen={!!selectedMovieId}
          onClose={handleCloseModal}
          onWatchNow={() => {}} // No longer needed since we navigate to movie page
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}