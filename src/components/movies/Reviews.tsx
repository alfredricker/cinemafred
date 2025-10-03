'use client';
import React from 'react';
import { Star } from 'lucide-react';

interface Rating {
  id: string;
  value: number;
  created_at: string;
  user: {
    username: string;
    id: string;
  };
}

interface Review {
  id: string;
  review_text: string | null;
  rating: number;
  created_at: string;
  user: {
    username: string;
    id: string;
  };
}

interface ReviewsProps {
  ratings: Rating[];
  reviews: Review[];
}

const SmallRatingStars: React.FC<{ rating: number }> = ({ rating }) => {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => {
        const fillPercentage = Math.max(0, Math.min(1, rating - i));
        const isFilled = fillPercentage >= 1;
        const isHalfFilled = fillPercentage >= 0.5 && fillPercentage < 1;
        
        return (
          <Star
            key={i}
            className={`w-4 h-4 ${
              isFilled
                ? 'text-yellow-400 fill-yellow-400'
                : isHalfFilled
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-600'
            }`}
            style={
              isHalfFilled
                ? {
                    clipPath: 'inset(0 50% 0 0)',
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
};

export const Reviews: React.FC<ReviewsProps> = ({ ratings, reviews }) => {
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    } else {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  };

  // Create a map of reviews by user_id for quick lookup
  const reviewsByUserId = new Map(
    reviews.map(review => [review.user.id, review])
  );

  // Combine ratings with their reviews (if any)
  const combinedData = ratings.map(rating => ({
    id: rating.id,
    userId: rating.user.id,
    username: rating.user.username,
    rating: rating.value,
    created_at: rating.created_at,
    review_text: reviewsByUserId.get(rating.user.id)?.review_text || null
  }));

  if (combinedData.length === 0) {
    return (
      <div className="text-gray-400 text-sm text-center py-4">
        No ratings yet. Be the first to rate this movie!
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
      {combinedData.map((item) => (
        <div 
          key={item.id} 
          className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-white text-sm">
                {item.username}
              </span>
              <div className="flex items-center gap-2">
                <SmallRatingStars rating={item.rating} />
                <span className="text-yellow-400 text-sm font-medium">
                  {item.rating.toFixed(1)}
                </span>
              </div>
            </div>
            <span className="text-gray-400 text-xs">
              {formatDate(item.created_at)}
            </span>
          </div>
          {item.review_text && (
            <p className="text-gray-300 text-sm leading-relaxed mt-2">
              {item.review_text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default Reviews;

