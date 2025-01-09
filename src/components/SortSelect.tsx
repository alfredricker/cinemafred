'use client';
import React from 'react';
import { ChevronDown } from 'lucide-react';

export const SortSelect: React.FC = () => {
  return (
    <div className="relative">
      <select 
        className="appearance-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 pr-8 text-sm 
                   focus:outline-none focus:border-gray-600 text-gray-300"
        defaultValue="rating"
      >
        <option value="rating" className="bg-gray-900">Rating: High to Low</option>
        <option value="rating-asc" className="bg-gray-900">Rating: Low to High</option>
        <option value="year" className="bg-gray-900">Year: Newest</option>
        <option value="year-asc" className="bg-gray-900">Year: Oldest</option>
        <option value="title" className="bg-gray-900">Title: A-Z</option>
        <option value="title-desc" className="bg-gray-900">Title: Z-A</option>
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400" />
    </div>
  );
};