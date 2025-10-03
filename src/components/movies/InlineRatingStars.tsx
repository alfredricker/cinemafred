'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Star, X } from 'lucide-react';

interface InlineRatingStarsProps {
  movieId: string;
  initialRating: number | null;
  isEditable: boolean;
  onRatingChange?: (rating: number) => void;
}

export const InlineRatingStars: React.FC<InlineRatingStarsProps> = ({
  movieId,
  initialRating,
  isEditable,
  onRatingChange
}) => {
  const [rating, setRating] = useState<number>(initialRating || 0);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleRatingClick = async (newRating: number) => {
    if (!isEditable || isUpdating) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ value: newRating }),
      });

      if (!response.ok) throw new Error('Failed to update rating');

      setRating(newRating);
      if (onRatingChange) {
        onRatingChange(newRating);
      }
    } catch (err) {
      console.error('Rating error:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearRating = async () => {
    if (!isEditable || isUpdating || rating === 0) return;

    setIsUpdating(true);
    setShowContextMenu(false);
    
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to clear rating');

      setRating(0);
      if (onRatingChange) {
        onRatingChange(0);
      }
    } catch (err) {
      console.error('Clear rating error:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isEditable || rating === 0) return;
    
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  const displayRating = hoverRating !== null ? hoverRating : rating;

  return (
    <>
      <div 
        className="flex gap-0.5 items-center relative"
        onMouseLeave={() => isEditable && setHoverRating(null)}
        onContextMenu={handleContextMenu}
      >
        {Array.from({ length: 10 }).map((_, i) => {
          const starValue = i + 1;
          const isFilled = displayRating >= starValue;
          const isHalfFilled = displayRating >= starValue - 0.5 && displayRating < starValue;
          
          return (
            <button
              key={i}
              onClick={() => handleRatingClick(starValue)}
              onMouseEnter={() => isEditable && setHoverRating(starValue)}
              className={`focus:outline-none ${isEditable ? 'cursor-pointer' : 'cursor-default'} ${isUpdating ? 'opacity-50' : ''}`}
              disabled={!isEditable || isUpdating}
              title={isEditable ? `Rate ${starValue}` : ''}
            >
              <Star
                className={`w-4 h-4 transition-colors ${
                  isFilled
                    ? 'text-yellow-400 fill-yellow-400'
                    : isHalfFilled
                    ? 'text-yellow-400 fill-yellow-400'
                    : 'text-gray-600'
                } ${isEditable && !isUpdating ? 'hover:text-yellow-300' : ''}`}
              />
            </button>
          );
        })}
        {displayRating > 0 && (
          <span className="ml-1 text-xs text-gray-400 font-medium min-w-[2rem]">
            {displayRating.toFixed(1)}
          </span>
        )}
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
          style={{ 
            left: `${contextMenuPos.x}px`, 
            top: `${contextMenuPos.y}px` 
          }}
        >
          <button
            onClick={handleClearRating}
            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 transition-colors flex items-center gap-2"
            disabled={isUpdating}
          >
            <X className="w-4 h-4" />
            Clear Rating
          </button>
        </div>
      )}
    </>
  );
};

export default InlineRatingStars;

