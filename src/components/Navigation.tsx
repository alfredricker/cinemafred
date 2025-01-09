'use client';
import React from 'react';

export const Navigation: React.FC = () => {
  return (
    <nav>
      <ul className="flex gap-6">
        <li>
          <a href="#" className="hover:text-blue-300 transition-colors">Home</a>
        </li>
        <li>
          <a href="#" className="hover:text-blue-300 transition-colors">Top Rated</a>
        </li>
        <li>
          <a href="#" className="hover:text-blue-300 transition-colors">Genres</a>
        </li>
      </ul>
    </nav>
  );
};