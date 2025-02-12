'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import { Movie } from '@/types/movie';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Star, Pencil } from 'lucide-react';
import { EditMovieForm } from './EditMovieForm';

interface MovieCardProps {
  movie: Movie;
  priority?: boolean;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, priority = false }) => {
  const router = useRouter();
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.edit-button')) return;
    if (movie.id) router.push(`/movie/${movie.id}`);
  };

  // Ensure WEBP format by appending `.webp` or adding a query param (if backend supports it)
  const imageUrl = movie.r2_image_path
    ? `/api/movie/${movie.r2_image_path.split('/').pop()}?format=webp`
    : null;

  return (
    <>
      <div className="cursor-pointer group relative" onClick={handleCardClick}>
        {user?.isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowEditForm(true);
            }}
            className="edit-button absolute top-2 right-2 p-2 bg-black/50 rounded-full 
                      opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all
                      backdrop-blur-sm z-10"
            title="Edit movie"
          >
            <Pencil className="w-4 h-4 text-white" />
          </button>
        )}

        <div className="relative aspect-[27/40] overflow-hidden rounded-lg bg-gray-900">
          {imageUrl && !imageError ? (
            <Image
              src={imageUrl}
              alt={movie.title}
              fill
              quality={70} // Set quality to balance performance & clarity
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

        <div className="mt-2">
          <h3 className="text-gray-100 font-medium line-clamp-1">{movie.title}</h3>
          {movie.year && <p className="text-sm text-gray-400">{movie.year}</p>}

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

      {showEditForm && (
        <EditMovieForm
          isOpen={showEditForm}
          onClose={() => setShowEditForm(false)}
          movie={movie}
        />
      )}
    </>
  );
};
