import React from 'react';
import { ArrowLeft, Subtitles, Settings } from 'lucide-react';
import { VideoControlsProps } from './types';
import { QualitySelector } from './QualitySelector';

export const VideoControls: React.FC<VideoControlsProps> = ({
  onBack,
  subtitlesUrl,
  captionsOn,
  onToggleCaptions,
  isHLSSupported,
  availableQualities,
  currentQuality,
  showQualityMenu,
  onToggleQualityMenu,
  onQualityChange,
}) => {
  return (
    <div className="absolute top-4 left-4 z-50 flex gap-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 
                  text-white rounded-lg transition-colors backdrop-blur-sm"
        title="Go back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Subtitles toggle */}
      {subtitlesUrl && (
        <button
          onClick={onToggleCaptions}
          className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors backdrop-blur-sm ${
            captionsOn 
              ? 'bg-blue-600/80 hover:bg-blue-700/80 text-white' 
              : 'bg-black/60 hover:bg-black/80 text-white'
          }`}
          title={captionsOn ? "Turn off subtitles" : "Turn on subtitles"}
        >
          <Subtitles className="w-5 h-5" />
        </button>
      )}

      {/* Quality selector for HLS */}
      {isHLSSupported && availableQualities.length > 1 && (
        <div className="relative">
          <button
            onClick={onToggleQualityMenu}
            className="flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 
                      text-white rounded-lg transition-colors backdrop-blur-sm"
            title="Quality settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {showQualityMenu && (
            <QualitySelector
              availableQualities={availableQualities}
              currentQuality={currentQuality}
              onQualityChange={onQualityChange}
              onClose={() => onToggleQualityMenu()}
            />
          )}
        </div>
      )}
    </div>
  );
};
