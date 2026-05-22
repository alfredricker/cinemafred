import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { VideoPlayerProps, VideoPlayerState, HLSStats } from './types';
import { HLSManager } from './HLSManager';
import { VideoControls } from './VideoControls';
import { ErrorOverlay } from './ErrorOverlay';
import { HLSStatsOverlay } from './HLSStatsOverlay';
import { useSubtitles } from '@/hooks/useSubtitles';

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  poster,
  title,
  movieId,
  movieYear = 0,
  subtitlesUrl,
  isAdmin = false,
  onClose,
  useHLS = true
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsManagerRef = useRef<HLSManager | null>(null);
  const router = useRouter();

  const [state, setState] = useState<VideoPlayerState>({
    videoError: null,
    retryCount: 0,
    isHLSSupported: false,
    availableQualities: [],
    currentQuality: 'auto',
    showQualityMenu: false,
    showSubtitleMenu: false,
    hlsStats: { loadedBytes: 0, totalBytes: 0, currentLevel: -1 }
  });

  const maxRetries = 3;

  // Subtitle management
  const { options: subtitleOptions, loading: subtitlesLoading, activeId: activeSubtitleId, activeUrl: activeSubtitleUrl, selectSubtitle } = useSubtitles(title, movieYear, subtitlesUrl);

  // Activate/deactivate the text track when the active subtitle URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!activeSubtitleUrl) {
      Array.from(video.textTracks).forEach(t => (t.mode = 'hidden'));
      return;
    }

    // Brief delay allows React to remount the <track> element before we set its mode
    const timer = setTimeout(() => {
      const track = video.textTracks[0];
      if (track) track.mode = 'showing';
    }, 150);

    return () => clearTimeout(timer);
  }, [activeSubtitleUrl]);

  const getAuthenticatedStreamUrl = useCallback((isHLS: boolean = false) => {
    const token = localStorage.getItem('token');
    if (!token) return streamUrl;
    const baseUrl = isHLS ? `/api/hls/${movieId}` : streamUrl;
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}token=${encodeURIComponent(token)}`;
  }, [movieId, streamUrl]);

  const handleHLSError = useCallback((error: string) => {
    setState(prev => ({ ...prev, videoError: error }));
  }, []);

  const handleHLSStatsUpdate = useCallback((stats: Partial<HLSStats>) => {
    setState(prev => ({ ...prev, hlsStats: { ...prev.hlsStats, ...stats } }));
  }, []);

  const handleHLSQualitiesUpdate = useCallback((qualities: string[]) => {
    setState(prev => ({ ...prev, availableQualities: qualities, isHLSSupported: true }));
  }, []);

  const initializeMP4 = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setState(prev => ({ ...prev, isHLSSupported: false }));
    video.src = getAuthenticatedStreamUrl(false);
  }, [getAuthenticatedStreamUrl]);

  const initializePlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (useHLS) {
      hlsManagerRef.current = new HLSManager({
        movieId, videoRef,
        onError: handleHLSError,
        onStatsUpdate: handleHLSStatsUpdate,
        onQualitiesUpdate: handleHLSQualitiesUpdate,
        getAuthenticatedUrl: getAuthenticatedStreamUrl
      });
      if (!hlsManagerRef.current.initialize()) initializeMP4();
    } else {
      initializeMP4();
    }
  }, [useHLS, movieId, getAuthenticatedStreamUrl, handleHLSError, handleHLSStatsUpdate, handleHLSQualitiesUpdate, initializeMP4]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && video.currentTime > 0) {
      localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
    }
  }, [movieId]);

  const handleLoadStart = useCallback(() => {
    setState(prev => ({ ...prev, videoError: null }));
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const savedPosition = localStorage.getItem(`video-position-${movieId}`);
    if (savedPosition) {
      const position = parseFloat(savedPosition);
      if (position > 0 && position < video.duration) video.currentTime = position;
    }
  }, [movieId]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (video?.error) {
      const errorTypes: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
      };
      const type = errorTypes[video.error.code] ?? 'UNKNOWN';
      setState(prev => ({ ...prev, videoError: `${type}: ${video.error!.message}` }));
    }
  }, []);

  const handleBack = useCallback(() => {
    if (videoRef.current) {
      localStorage.setItem(`video-position-${movieId}`, videoRef.current.currentTime.toString());
    }
    if (onClose) onClose();
    else window.location.href = `/movie/${movieId}`;
  }, [movieId, onClose]);

  const handleToggleQualityMenu = useCallback(() => {
    setState(prev => ({ ...prev, showQualityMenu: !prev.showQualityMenu, showSubtitleMenu: false }));
  }, []);

  const handleToggleSubtitleMenu = useCallback(() => {
    setState(prev => ({ ...prev, showSubtitleMenu: !prev.showSubtitleMenu, showQualityMenu: false }));
  }, []);

  const handleQualityChange = useCallback((quality: string) => {
    if (hlsManagerRef.current) hlsManagerRef.current.setQuality(quality);
    setState(prev => ({ ...prev, currentQuality: quality, showQualityMenu: false }));
  }, []);

  const handleRetry = useCallback(() => {
    if (state.retryCount >= maxRetries) {
      setState(prev => ({ ...prev, videoError: 'Failed to load video after multiple attempts' }));
      return;
    }
    setState(prev => ({ ...prev, retryCount: prev.retryCount + 1, videoError: null }));
    if (hlsManagerRef.current) { hlsManagerRef.current.destroy(); hlsManagerRef.current = null; }
    initializePlayer();
  }, [state.retryCount, maxRetries, initializePlayer]);

  const handleFallbackToMP4 = useCallback(() => {
    setState(prev => ({ ...prev, videoError: null, retryCount: 0 }));
    if (hlsManagerRef.current) { hlsManagerRef.current.destroy(); hlsManagerRef.current = null; }
    initializeMP4();
  }, [initializeMP4]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const events = [
      ['loadstart', handleLoadStart],
      ['timeupdate', handleTimeUpdate],
      ['error', handleVideoError],
      ['loadedmetadata', handleLoadedMetadata]
    ] as const;

    events.forEach(([event, handler]) => video.addEventListener(event, handler));
    initializePlayer();

    return () => {
      events.forEach(([event, handler]) => video.removeEventListener(event, handler));
      if (hlsManagerRef.current) { hlsManagerRef.current.destroy(); hlsManagerRef.current = null; }
    };
  }, [movieId, streamUrl, useHLS, initializePlayer, handleLoadStart, handleTimeUpdate, handleVideoError, handleLoadedMetadata]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <VideoControls
        onBack={handleBack}
        subtitleOptions={subtitleOptions}
        activeSubtitleId={activeSubtitleId}
        subtitlesLoading={subtitlesLoading}
        onSubtitleChange={selectSubtitle}
        showSubtitleMenu={state.showSubtitleMenu}
        onToggleSubtitleMenu={handleToggleSubtitleMenu}
        isHLSSupported={state.isHLSSupported}
        availableQualities={state.availableQualities}
        currentQuality={state.currentQuality}
        showQualityMenu={state.showQualityMenu}
        onToggleQualityMenu={handleToggleQualityMenu}
        onQualityChange={handleQualityChange}
      />

      {isAdmin && state.isHLSSupported && hlsManagerRef.current?.instance && (
        <HLSStatsOverlay
          stats={state.hlsStats}
          hlsInstance={hlsManagerRef.current.instance}
          videoRef={videoRef}
          useHLS={useHLS}
        />
      )}

      <div className="flex-1 relative bg-slate-900">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full"
          controls
          poster={poster}
          preload="auto"
          controlsList="nodownload"
          crossOrigin="anonymous"
          style={{ backgroundColor: 'transparent', objectFit: 'contain', objectPosition: 'center' }}
        >
          {activeSubtitleUrl && (
            <track
              key={activeSubtitleUrl}
              kind="subtitles"
              src={activeSubtitleUrl}
              srcLang="en"
              label="English"
            />
          )}
        </video>

        {state.videoError && (
          <ErrorOverlay
            error={state.videoError}
            onRetry={handleRetry}
            onFallbackToMP4={useHLS ? handleFallbackToMP4 : undefined}
            showMP4Fallback={useHLS}
          />
        )}
      </div>
    </div>
  );
};
