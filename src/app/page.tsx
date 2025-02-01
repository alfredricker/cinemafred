'use client';
import { Header } from '@/components/Header';
import { MovieGridHeader } from '@/components/MovieGridHeader';
import { MovieGrid } from '@/components/MovieGrid';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function Home() {
  const { user, isLoading } = useAuth();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState('title-asc');

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

  const handleGenreSelect = (genre: string | null) => {
    setSelectedGenre(genre);
  };

  const handleSortChange = (option: string) => {
    setSortOption(option);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <Header />
      <MovieGridHeader
        onGenreSelect={handleGenreSelect}
        onSortChange={handleSortChange}
        selectedGenre={selectedGenre}
        selectedSort={sortOption}
      />
      <main className="px-16">
        <div className="max-w-[128rem] mx-auto pt-8 pb-16">
          <MovieGrid 
            selectedGenre={selectedGenre}
            sortOption={sortOption}
          />
        </div>
      </main>
    </div>
  );
}