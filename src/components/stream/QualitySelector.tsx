import React from 'react';
import { QualitySelectorProps } from './types';

export const QualitySelector: React.FC<QualitySelectorProps> = ({
  availableQualities,
  currentQuality,
  onQualityChange,
  onClose,
}) => {
  const handleQualitySelect = (quality: string) => {
    onQualityChange(quality);
    onClose();
  };

  return (
    <div className="absolute top-12 left-0 bg-black/90 backdrop-blur-sm rounded-lg 
                  border border-gray-600 min-w-[120px] z-60">
      <div className="p-2">
        <div className="text-white text-sm font-medium mb-2 px-2">Quality</div>
        {availableQualities.map((quality) => (
          <button
            key={quality}
            onClick={() => handleQualitySelect(quality)}
            className={`w-full text-left px-2 py-1 text-sm rounded transition-colors ${
              currentQuality === quality
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {quality}
          </button>
        ))}
      </div>
    </div>
  );
};
