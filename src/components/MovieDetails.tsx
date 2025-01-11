'use client';
import { useState } from 'react';
import { useMovie } from '@/hooks/useMovie';
import { Star } from 'lucide-react';
import { RatingStars } from './RatingStars';

interface MovieDetailsProps {
  id: string;
}

export const MovieDetails: React.FC<MovieDetailsProps> = ({ id }) => {
  const { movie, updateRating } = useMovie(id);
  const [showReviews, setShowReviews] = useState(false);

  if (!movie) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-[300px,1fr] gap-8">
        <div>
          <img 
            src={movie.r2_image_path} 
            alt={movie.title}
            className="w-full rounded-lg shadow-lg"
          />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-100 mb-2">{movie.title}</h1>
          <p className="text-xl text-gray-400 mb-4">{movie.year}</p>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center">
              <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 mr-2" />
              <span className="text-2xl font-bold text-gray-100">{movie.rating.toFixed(1)}</span>
              <span className="text-gray-400 ml-1">/10</span>
            </div>
            <RatingStars rating={movie.rating} onRatingChange={updateRating} />
          </div>

          <div className="flex gap-2 mb-4">
            {movie.genre.map((g) => (
              <span key={g} className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
                {g}
              </span>
            ))}
          </div>

          <p className="text-gray-300 mb-6">{movie.description}</p>

          <button 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors mb-8"
            onClick={() => window.open(movie.streamingUrl, '_blank')}
          >
            Watch Now
          </button>

          <div>
            <button 
              className="text-blue-400 hover:text-blue-300 transition-colors"
              onClick={() => setShowReviews(!showReviews)}
            >
              {showReviews ? 'Hide Reviews' : 'Show Reviews'}
            </button>

            {showReviews && (
              <div className="mt-4 space-y-4">
                {/* Reviews would be fetched and displayed here */}
                <p className="text-gray-400">No reviews yet. Be the first to rate this movie!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};