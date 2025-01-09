'use client';
import React from 'react';
import { Star } from 'lucide-react';

interface RatingStarsProps {
  rating: number;
  onRatingChange: (rating: number) => void;
}

export const RatingStars: React.FC<RatingStarsProps> = ({ rating, onRatingChange }) => {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRatingChange(star * 2)}
          className="focus:outline-none"
        >
          <Star
            className={`w-5 h-5 ${
              star * 2 <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'
            } hover:text-yellow-400 transition-colors`}
          />
        </button>
      ))}
      <span className="ml-2 text-gray-300 font-bold">{rating.toFixed(1)}</span>
    </div>
  );
};