import React from 'react';
import { Loader2, X } from 'lucide-react';

interface TMDBPosterSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  posters: string[];
  onSelect: (posterUrl: string) => void;
  isLoading: boolean;
  selectedPosterUrl: string | null;
}

export const TMDBPosterSelector: React.FC<TMDBPosterSelectorProps> = ({
  isOpen,
  onClose,
  posters,
  onSelect,
  isLoading,
  selectedPosterUrl,
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-[60]">
        <div 
          className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-gray-800">
            <h3 className="text-xl font-semibold text-white">Select a Poster from TMDB</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              disabled={isLoading}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 webkit-scrollbar">
            {posters.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>No posters available</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {posters.map((posterUrl, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onSelect(posterUrl)}
                    disabled={isLoading}
                    className={`relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all ${
                      selectedPosterUrl === posterUrl
                        ? 'border-blue-500 ring-2 ring-blue-500'
                        : 'border-gray-700 hover:border-blue-400'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
                  >
                    <img
                      src={posterUrl}
                      alt={`Poster ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {selectedPosterUrl === posterUrl && (
                      <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                        <span className="bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium">
                          Selected
                        </span>
                      </div>
                    )}
                    {isLoading && selectedPosterUrl === posterUrl && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .webkit-scrollbar::-webkit-scrollbar {
          width: 12px;
        }

        .webkit-scrollbar::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 6px;
        }

        .webkit-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.8);
          border-radius: 6px;
        }

        .webkit-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 1);
        }
      `}</style>
    </>
  );
};

