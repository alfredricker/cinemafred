import React, { useState, useEffect, useRef } from 'react';
import { Star, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface RatingStarsProps {
  movieId: string;
  initialRating?: number;
  onRatingChange?: (rating?: number) => void;
  size?: 'default' | 'inline';
  isEditable?: boolean;
}

export const RatingStars: React.FC<RatingStarsProps> = ({ 
  movieId, 
  initialRating = 0, 
  onRatingChange,
  size = 'default',
  isEditable = true
}) => {
  const [rating, setRating] = useState<number>(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  
  // Determine if component should be interactive
  const canEdit = isEditable && user && !user.isAdmin;

  // Update rating when initialRating prop changes (for inline mode)
  useEffect(() => {
    setRating(initialRating || 0);
  }, [initialRating]);

  useEffect(() => {
    if (isEditable && user) {
      fetchUserRating();
    }
  }, [movieId, isEditable, user]);

  const fetchUserRating = async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rating !== null) {
          setUserRating(data.rating);
          setRating(data.rating);
        } else {
          setRating(initialRating);
        }
      }
    } catch (err) {
      console.error('Error fetching user rating:', err);
      setRating(initialRating);
    }
  };

  const handleRatingChange = async (newRating: number) => {
    if (!canEdit) {
      if (!user) {
        setError('Please log in to rate movies');
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ value: newRating }),
      });

      if (!response.ok) {
        throw new Error('Failed to update rating');
      }

      setUserRating(newRating);
      setRating(newRating);

      const data = await response.json();
      if (data.averageRating) {
        // Available for parent component if needed
      }

      // Notify parent component that rating changed
      if (onRatingChange) {
        onRatingChange(newRating);
      }
    } catch (err) {
      setError('Failed to update rating');
      console.error('Rating error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateRating = (index: number, clientX: number, target: HTMLElement) => {
    const { left, width } = target.getBoundingClientRect();
    const offsetX = clientX - left;
    const fraction = offsetX / width;
    return index + (fraction > 0.5 ? 1 : 0.5);
  };

  const handleClearRating = async () => {
    if (!canEdit || isLoading) return;

    setIsLoading(true);
    setShowContextMenu(false);
    setError(null);
    
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to clear rating');

      setUserRating(null);
      setRating(0);

      if (onRatingChange) {
        onRatingChange(0);
      }
    } catch (err) {
      setError('Failed to clear rating');
      console.error('Clear rating error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // Only show context menu if editable and user has a rating
    if (!canEdit) return;
    
    const currentRating = userRating || rating;
    if (!currentRating || currentRating === 0) return;
    
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
  const starSize = size === 'inline' ? 'w-5 h-5' : 'w-6 h-6';
  const gapSize = size === 'inline' ? 'gap-0.5' : 'gap-1';
  const textSize = size === 'inline' ? 'text-sm' : 'text-base';
  const marginSize = size === 'inline' ? 'ml-1' : 'ml-2';

  return (
    <div className={`flex items-center ${size === 'inline' ? 'gap-0' : 'gap-2'} relative`}>
      <div
        className={`flex ${gapSize}`}
        onMouseLeave={() => canEdit && setHoverRating(null)}
        onContextMenu={handleContextMenu}
      >
        {Array.from({ length: 10 }).map((_, i) => {
          const isFilled = displayRating >= i + 1;
          const isHalfFilled = displayRating >= i + 0.5 && displayRating < i + 1;
          
          return (
            <button
              key={i}
              onClick={(e) => {
                if (!canEdit) return;
                const newRating = calculateRating(i, e.clientX, e.currentTarget);
                handleRatingChange(newRating);
              }}
              onMouseMove={(e) => {
                if (canEdit) {
                  const hoverValue = calculateRating(i, e.clientX, e.currentTarget);
                  setHoverRating(hoverValue);
                }
              }}
              className={`focus:outline-none ${canEdit ? 'cursor-pointer' : 'cursor-default'} ${isLoading ? 'opacity-50' : ''}`}
              disabled={!canEdit || isLoading}
              title={!isEditable ? '' : !user ? 'Please log in to rate movies' : user.isAdmin ? 'Admins cannot rate movies' : `Rate ${(i + 1)}`}
            >
              <Star
                className={`${starSize} ${
                  isFilled
                    ? 'text-yellow-400 fill-yellow-400'
                    : isHalfFilled
                    ? 'text-yellow-400'
                    : 'text-gray-600'
                } ${canEdit && !isLoading ? 'hover:text-yellow-400' : ''} transition-colors`}
              />
            </button>
          );
        })}
      </div>

      {size === 'default' && isLoading ? (
        <Loader2 className="w-4 h-4 ml-2 animate-spin text-blue-500" />
      ) : displayRating > 0 ? (
        <span className={`${marginSize} ${size === 'inline' ? 'text-sm text-gray-400' : 'text-gray-300'} font-medium ${size === 'inline' ? 'min-w-[2rem]' : ''}`}>
          {userRating && isEditable ? (
            <span className="text-yellow-400">{displayRating.toFixed(1)}</span>
          ) : (
            displayRating.toFixed(1)
          )}
        </span>
      ) : null}

      {size === 'default' && error && (
        <span className="ml-2 text-sm text-red-500">{error}</span>
      )}

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
            disabled={isLoading}
          >
            <X className="w-4 h-4" />
            Clear Rating
          </button>
        </div>
      )}
    </div>
  );
};

export default RatingStars;
