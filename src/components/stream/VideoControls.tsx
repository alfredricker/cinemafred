import React from 'react';
import { ArrowLeft, Subtitles, Settings } from 'lucide-react';
import { VideoControlsProps } from './types';
import { QualitySelector } from './QualitySelector';
import { SubtitleSelector } from './SubtitleSelector';

export const VideoControls: React.FC<VideoControlsProps> = ({
  onBack,
  subtitleOptions,
  activeSubtitleId,
  subtitlesLoading,
  onSubtitleChange,
  showSubtitleMenu,
  onToggleSubtitleMenu,
  isHLSSupported,
  availableQualities,
  currentQuality,
  showQualityMenu,
  onToggleQualityMenu,
  onQualityChange,
}) => {
  const hasSubtitles = subtitleOptions.length > 0 || subtitlesLoading;

  return (
    <div className="absolute top-4 left-4 z-50 flex gap-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors backdrop-blur-sm"
        title="Go back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Subtitle selector */}
      {hasSubtitles && (
        <div className="relative">
          <button
            onClick={onToggleSubtitleMenu}
            className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors backdrop-blur-sm ${
              activeSubtitleId
                ? 'bg-blue-600/80 hover:bg-blue-700/80 text-white'
                : 'bg-black/60 hover:bg-black/80 text-white'
            }`}
            title="Subtitles"
          >
            <Subtitles className="w-5 h-5" />
          </button>

          {showSubtitleMenu && (
            <SubtitleSelector
              options={subtitleOptions}
              activeId={activeSubtitleId}
              loading={subtitlesLoading}
              onSelect={onSubtitleChange}
              onClose={onToggleSubtitleMenu}
            />
          )}
        </div>
      )}

      {/* Quality selector */}
      {isHLSSupported && availableQualities.length > 1 && (
        <div className="relative">
          <button
            onClick={onToggleQualityMenu}
            className="flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors backdrop-blur-sm"
            title="Quality settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {showQualityMenu && (
            <QualitySelector
              availableQualities={availableQualities}
              currentQuality={currentQuality}
              onQualityChange={onQualityChange}
              onClose={onToggleQualityMenu}
            />
          )}
        </div>
      )}
    </div>
  );
};
