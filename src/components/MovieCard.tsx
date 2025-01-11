'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import { Movie } from '@/types/movie';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';

interface MovieCardProps {
  movie: Movie;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie }) => {
  const router = useRouter();
  const [imageError, setImageError] = useState(false);

  const handleCardClick = () => {
    if (movie.id) {
      router.push(`/movie/${movie.id}`);
    } else {
      console.error('Movie ID is missing. Cannot navigate.');
    }
  };

  return (
    <div
      className="cursor-pointer group"
      onClick={handleCardClick}
    >
      {/* Image Container */}
      <div className="relative aspect-[27/40] overflow-hidden rounded-lg bg-gray-900">
        {movie.r2_image_path && !imageError ? (
          <Image
            src={movie.r2_image_path}
            alt={movie.title}
            fill
            unoptimized
            className="object-cover transition-transform group-hover:scale-105"
            onError={() => {
              console.error(`Failed to load image for ${movie.title}`);
              setImageError(true);
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <span className="text-gray-500">No image</span>
          </div>
        )}
      </div>

      {/* Movie Details */}
      <div className="mt-2">
        <h3 className="text-gray-100 font-medium line-clamp-1">
          {movie.title || 'Untitled Movie'}
        </h3>
        {movie.year && (
          <p className="text-sm text-gray-400">{movie.year}</p>
        )}
        
        <div className="flex items-center mt-1">
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 mr-1" />
          <span className="text-yellow-400 font-medium">
            {movie.averageRating 
              ? movie.averageRating.toFixed(1) 
              : movie.rating.toFixed(1)}
          </span>
          <span className="text-gray-500 text-sm ml-1">/10</span>
          {movie._count && (
            <span className="text-gray-500 text-xs ml-2">
              ({movie._count.ratings} {movie._count.ratings === 1 ? 'rating' : 'ratings'})
            </span>
          )}
        </div>
      </div>
    </div>
  );
};