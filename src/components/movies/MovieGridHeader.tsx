import React, { useState } from 'react';

interface MovieGridHeaderProps {
  onGenreSelect?: (genre: string | null) => void;
  onSortChange?: (option: string) => void;
  selectedGenre: string | null;
  selectedSort: string;
}

export const MovieGridHeader: React.FC<MovieGridHeaderProps> = ({
  onGenreSelect,
  onSortChange,
  selectedGenre,
  selectedSort,
}) => {
  const genres = [
    'Drama',
    'Sci-fi',
    'Comedy',
    'Horror',
    'Romance',
    'Thriller',
    'Action',
    'Fantasy',
    'Adventure'
  ];

  const sortOptions = [
    { value: 'title-asc', label: 'Title: A-Z' },
    { value: 'title-desc', label: 'Title: Z-A' },
    { value: 'rating-desc', label: 'Rating: High-Low' },
    { value: 'rating-asc', label: 'Rating: Low-High' },
    { value: 'year-desc', label: 'Year: New-Old' },
    { value: 'year-asc', label: 'Year: Old-New' },
  ];

  const handleGenreClick = (genre: string | null) => {
    onGenreSelect?.(genre);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSortChange?.(e.target.value);
  };

  return (
    <div className="py-2 px-16">
      <div className="max-w-[128rem] mx-auto">
        <div className="flex items-center justify-between">
          {/* Genre Filters */}
          <div className="flex items-center gap-2 overflow-x-auto flex-grow">
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

          {/* Sort Dropdown */}
          <div className="ml-6">
            <select
              value={selectedSort}
              onChange={handleSortChange}
              className="bg-gray-800/50 border border-gray-700 rounded-md px-4 py-1.5 text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       hover:bg-gray-800/80 transition-colors min-w-[200px]"
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