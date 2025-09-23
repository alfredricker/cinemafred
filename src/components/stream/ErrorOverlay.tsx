import React from 'react';
import { ErrorOverlayProps } from './types';

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({
  error,
  onRetry,
  onFallbackToMP4,
  showMP4Fallback,
}) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
      <div className="text-red-400 text-lg mb-4">Video Error</div>
      <div className="text-white text-sm text-center mb-4 max-w-md">
        {error}
      </div>
      <div className="flex gap-4">
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Retry
        </button>
        {showMP4Fallback && onFallbackToMP4 && (
          <button
            onClick={onFallbackToMP4}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Use MP4
          </button>
        )}
      </div>
    </div>
  );
};
