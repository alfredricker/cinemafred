import React from 'react';
import { HLSStats } from './types';

interface HLSStatsOverlayProps {
  stats: HLSStats;
  hlsInstance: any; // HLS instance
  videoRef: React.RefObject<HTMLVideoElement>;
  useHLS: boolean;
}

export const HLSStatsOverlay: React.FC<HLSStatsOverlayProps> = ({
  stats,
  hlsInstance,
  videoRef,
  useHLS,
}) => {
  const getQualityInfo = () => {
    if (stats.currentLevel >= 0 && hlsInstance?.levels) {
      const level = hlsInstance.levels[stats.currentLevel];
      return level ? `${level.height}p (${Math.round(level.bitrate / 1000)}k)` : stats.currentLevel;
    }
    return 'Auto';
  };

  const getBufferInfo = () => {
    const video = videoRef.current;
    if (!video) return '0s';

    const buffered = video.buffered;
    if (buffered.length > 0) {
      const bufferEnd = buffered.end(buffered.length - 1);
      const bufferSeconds = bufferEnd - video.currentTime;
      return `${bufferSeconds.toFixed(1)}s`;
    }
    return '0s';
  };

  return (
    <div className="absolute top-4 right-4 z-50 bg-black/60 backdrop-blur-sm rounded-lg p-2 text-white text-xs max-w-xs">
      <div className="font-semibold mb-1">📊 HLS Stats</div>
      <div>Quality: {getQualityInfo()}</div>
      <div>Loaded: {(stats.loadedBytes / 1024 / 1024).toFixed(1)}MB</div>
      <div>Levels: {hlsInstance?.levels?.length || 0}</div>
      <div>Buffer: {getBufferInfo()}</div>
      <div>Mode: {useHLS ? 'HLS' : 'MP4'}</div>
    </div>
  );
};
