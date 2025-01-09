'use client';
import React from 'react';
import { Movie } from '../types/movie';
import { useRouter } from 'next/navigation';

interface MovieCardProps {
  movie: Movie;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie }) => {
  const router = useRouter();

  return (
    <div 
      className="cursor-pointer group"
      onClick={() => router.push(`/movie/${movie.id}`)}
    >
      <div className="relative aspect-[27/40] overflow-hidden rounded-lg">
        <img 
          src={movie.poster} 
          alt={movie.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
      </div>
      <div className="mt-2">
        <h3 className="text-gray-100 font-medium line-clamp-1">{movie.title}</h3>
        <p className="text-sm text-gray-400">{movie.year}</p>
        <div className="flex items-center mt-1">
          <span className="text-yellow-400 font-medium">{movie.rating.toFixed(1)}</span>
          <span className="text-gray-500 text-sm ml-1">/10</span>
        </div>
      </div>
    </div>
  );
};