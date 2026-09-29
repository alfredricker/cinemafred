import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface MovieGridHeaderProps {
  onGenreSelect?: (genre: string | null) => void;
  onSortChange?: (option: string) => void;
  selectedGenre: string | null;
  selectedSort: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const MovieGridHeader: React.FC<MovieGridHeaderProps> = ({
  onGenreSelect,
  onSortChange,
  selectedGenre,
  selectedSort,
  searchQuery = '',
  onSearchChange,
}) => {
  const genres = [
    'Drama',
    'Sci-fi',
    'Comedy',
    'Horror',
    'Documentary',
    'Romance',
    'Thriller',
    'Action',
    'Fantasy',
  ];

  const sortOptions = [
    { value: 'title-asc', label: 'Title: A-Z' },
    { value: 'created-desc', label: 'Recently Added' },
    { value: 'rating-desc', label: 'Rating: High-Low' },
    { value: 'title-desc', label: 'Title: Z-A' },
    { value: 'rating-asc', label: 'Rating: Low-High' },
    { value: 'year-desc', label: 'Year: New-Old' },
    { value: 'year-asc', label: 'Year: Old-New' },
    { value: 'random', label: 'Random' },
  ];

  const handleGenreClick = (genre: string | null) => {
    onGenreSelect?.(genre);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSortChange?.(e.target.value);
  };

  return (
    <div className="py-2 px-4 sm:px-6 lg:px-16">
      <div className="max-w-[128rem] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
          {/* Genre Filters - bleed to the screen edges when scrolling on small screens */}
          <div className="order-2 lg:order-1 flex items-center gap-2 overflow-x-auto max-lg:no-scrollbar flex-grow min-w-0 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <button
              onClick={() => handleGenreClick(null)}
              className={`px-4 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                selectedGenre === null
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800/80'
              }`}
            >
              All
            </button>
            {genres.map((genre) => (
              <button
                key={genre}
                onClick={() => handleGenreClick(genre)}
                className={`px-4 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                  selectedGenre === genre
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800/80'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>

          <div className="order-1 lg:order-2 flex items-center gap-2 lg:gap-6 flex-shrink-0">
            {/* Search Field */}
            {onSearchChange && (
              <div className="relative flex-1 min-w-0 lg:flex-none lg:order-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  enterKeyHint="search"
                  placeholder="Search movies..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full lg:w-64 pl-9 pr-4 py-1.5 bg-gray-800/30 border border-gray-700/50 rounded-md text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                />
              </div>
            )}

            {/* Sort Dropdown */}
            <select
              value={selectedSort}
              onChange={handleSortChange}
              aria-label="Sort movies"
              className={`${onSearchChange ? 'w-40 sm:w-48' : 'w-full sm:w-auto'} lg:w-auto lg:min-w-[200px] lg:order-1 bg-gray-800/50 border border-gray-700 rounded-md px-3 lg:px-4 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:bg-gray-800/80 transition-colors`}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};