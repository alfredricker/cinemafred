import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { VideoPlayerProps, HLSStats } from './types';
import { HLSManager } from './HLSManager';
import { VideoControlBar } from './VideoControlBar';
import { ErrorOverlay } from './ErrorOverlay';
import { HLSStatsOverlay } from './HLSStatsOverlay';
import { useSubtitles } from '@/hooks/useSubtitles';

const HIDE_DELAY_MS = 3000;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsManagerRef = useRef<HLSManager | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(true);
  const menuOpenRef = useRef(false);
  const router = useRouter();

  // HLS / error state
  const [hlsState, setHlsState] = useState({
    videoError: null as string | null,
    retryCount: 0,
    isHLSSupported: false,
    availableQualities: [] as string[],
    currentQuality: 'auto',
    hlsStats: { loadedBytes: 0, totalBytes: 0, currentLevel: -1 } as HLSStats,
  });

  // Playback state
  const [playback, setPlayback] = useState({
    isPaused: true,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isFullscreen: false,
  });

  // Controls visibility
  const [showControls, setShowControls] = useState(true);

  const maxRetries = 3;

  // Subtitle management
  const {
    options: subtitleOptions,
    loading: subtitlesLoading,
    activeId: activeSubtitleId,
    activeUrl: activeSubtitleUrl,
    activeOption: activeSubtitleOption,
    selectSubtitle,
    searchOpenSubtitles,
    shiftActiveSubtitle,
  } = useSubtitles(title, movieYear, movieId, subtitlesUrl, false);

  // Activate/deactivate text track when active URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!activeSubtitleUrl) {
      Array.from(video.textTracks).forEach(t => (t.mode = 'hidden'));
      return;
    }
    const timer = setTimeout(() => {
      const track = video.textTracks[0];
      if (track) track.mode = 'showing';
    }, 150);
    return () => clearTimeout(timer);
  }, [activeSubtitleUrl]);

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!isPausedRef.current && !menuOpenRef.current) setShowControls(false);
    }, HIDE_DELAY_MS);
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  // Keep controls visible while paused or menu open
  useEffect(() => {
    if (playback.isPaused || menuOpenRef.current) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      setShowControls(true);
    } else {
      scheduleHide();
    }
  }, [playback.isPaused, scheduleHide]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          setShowControls(true);
          scheduleHide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          setShowControls(true); scheduleHide();
          break;
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(v.duration, v.currentTime + 10);
          setShowControls(true); scheduleHide();
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, Math.round((v.volume + 0.1) * 10) / 10);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, Math.round((v.volume - 0.1) * 10) / 10);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          v.muted = !v.muted;
          setPlayback(p => ({ ...p, volume: v.muted ? 0 : v.volume }));
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          handleToggleFullscreen();
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [scheduleHide]);

  // Fullscreen change sync
  useEffect(() => {
    const onFsChange = () => {
      setPlayback(p => ({ ...p, isFullscreen: Boolean(document.fullscreenElement) }));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // HLS authenticated URL
  const getAuthenticatedStreamUrl = useCallback((isHLS: boolean = false) => {
    const token = localStorage.getItem('token');
    const base = isHLS ? `/api/hls/${movieId}` : `/api/stream/${movieId}`;
    if (!token) return base;
    return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }, [movieId]);

  const handleHLSError = useCallback((error: string) => {
    setHlsState(prev => ({ ...prev, videoError: error }));
  }, []);

  const handleHLSStatsUpdate = useCallback((stats: Partial<HLSStats>) => {
    setHlsState(prev => ({ ...prev, hlsStats: { ...prev.hlsStats, ...stats } }));
  }, []);

  const handleHLSQualitiesUpdate = useCallback((qualities: string[]) => {
    setHlsState(prev => ({ ...prev, availableQualities: qualities, isHLSSupported: true }));
  }, []);

  const initializeMP4 = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setHlsState(prev => ({ ...prev, isHLSSupported: false }));
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
        getAuthenticatedUrl: getAuthenticatedStreamUrl,
      });
      if (!hlsManagerRef.current.initialize()) initializeMP4();
    } else {
      initializeMP4();
    }
  }, [useHLS, movieId, getAuthenticatedStreamUrl, handleHLSError, handleHLSStatsUpdate, handleHLSQualitiesUpdate, initializeMP4]);

  // Video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlers: [string, EventListener][] = [
      ['loadstart', () => setHlsState(p => ({ ...p, videoError: null }))],
      ['play', () => { setPlayback(p => ({ ...p, isPaused: false })); isPausedRef.current = false; }],
      ['pause', () => { setPlayback(p => ({ ...p, isPaused: true })); isPausedRef.current = true; }],
      ['volumechange', () => setPlayback(p => ({ ...p, volume: video.muted ? 0 : video.volume }))],
      ['durationchange', () => setPlayback(p => ({ ...p, duration: video.duration || 0 }))],
      ['timeupdate', () => {
        setPlayback(p => ({ ...p, currentTime: video.currentTime }));
        if (video.currentTime > 0) localStorage.setItem(`video-position-${movieId}`, String(video.currentTime));
      }],
      ['loadedmetadata', () => {
        setPlayback(p => ({ ...p, duration: video.duration || 0 }));
        const saved = parseFloat(localStorage.getItem(`video-position-${movieId}`) ?? '0');
        if (saved > 0 && saved < video.duration) video.currentTime = saved;
      }],
      ['error', () => {
        if (video.error) {
          const types: Record<number, string> = { 1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK', 3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
          setHlsState(p => ({ ...p, videoError: `${types[video.error!.code] ?? 'UNKNOWN'}: ${video.error!.message}` }));
        }
      }],
    ];

    handlers.forEach(([ev, fn]) => video.addEventListener(ev, fn));
    initializePlayer();

    return () => {
      handlers.forEach(([ev, fn]) => video.removeEventListener(ev, fn));
      if (hlsManagerRef.current) { hlsManagerRef.current.destroy(); hlsManagerRef.current = null; }
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [movieId, streamUrl, useHLS, initializePlayer]);

  // Handlers
  const handleBack = useCallback(() => {
    if (videoRef.current) localStorage.setItem(`video-position-${movieId}`, String(videoRef.current.currentTime));
    if (onClose) onClose(); else window.location.href = `/movie/${movieId}`;
  }, [movieId, onClose]);

  const handleTogglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }, []);

  const handleSeek = useCallback((time: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = time;
  }, []);

  const handleVolumeChange = useCallback((vol: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = vol === 0;
    v.volume = vol === 0 ? 0 : vol;
    setPlayback(p => ({ ...p, volume: vol }));
  }, []);

  const handleQualityChange = useCallback((quality: string) => {
    if (hlsManagerRef.current) hlsManagerRef.current.setQuality(quality);
    setHlsState(prev => ({ ...prev, currentQuality: quality }));
  }, []);

  const handleMenuOpen = useCallback((open: boolean) => {
    menuOpenRef.current = open;
    if (open) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      setShowControls(true);
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (hlsState.retryCount >= maxRetries) {
      setHlsState(p => ({ ...p, videoError: 'Failed to load video after multiple attempts' }));
      return;
    }
    setHlsState(p => ({ ...p, retryCount: p.retryCount + 1, videoError: null }));
    if (hlsManagerRef.current) { hlsManagerRef.current.destroy(); hlsManagerRef.current = null; }
    initializePlayer();
  }, [hlsState.retryCount, maxRetries, initializePlayer]);

  const handleFallbackToMP4 = useCallback(() => {
    setHlsState(p => ({ ...p, videoError: null, retryCount: 0 }));
    if (hlsManagerRef.current) { hlsManagerRef.current.destroy(); hlsManagerRef.current = null; }
    initializeMP4();
  }, [initializeMP4]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col"
      onMouseMove={handleMouseMove}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      {isAdmin && hlsState.isHLSSupported && hlsManagerRef.current?.instance && (
        <HLSStatsOverlay
          stats={hlsState.hlsStats}
          hlsInstance={hlsManagerRef.current.instance}
          videoRef={videoRef}
          useHLS={useHLS}
        />
      )}

      <div className="flex-1 relative bg-slate-900">
        {/* Double-click to toggle fullscreen */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full"
          poster={poster}
          preload="auto"
          crossOrigin="anonymous"
          onDoubleClick={handleToggleFullscreen}
          style={{ backgroundColor: 'transparent', objectFit: 'contain', objectPosition: 'center' }}
        >
          {activeSubtitleUrl && (
            <track key={activeSubtitleUrl} kind="subtitles" src={activeSubtitleUrl} srcLang="en" label="English" />
          )}
        </video>

        {hlsState.videoError && (
          <ErrorOverlay
            error={hlsState.videoError}
            onRetry={handleRetry}
            onFallbackToMP4={useHLS ? handleFallbackToMP4 : undefined}
            showMP4Fallback={useHLS}
          />
        )}

        <VideoControlBar
          show={showControls}
          isPaused={playback.isPaused}
          currentTime={playback.currentTime}
          duration={playback.duration}
          volume={playback.volume}
          isFullscreen={playback.isFullscreen}
          subtitleOptions={subtitleOptions}
          activeSubtitleId={activeSubtitleId}
          subtitlesLoading={subtitlesLoading}
          onSubtitleChange={selectSubtitle}
          onSubtitleSearch={() => void searchOpenSubtitles()}
          onSubtitleShift={activeSubtitleOption ? shiftActiveSubtitle : undefined}
          isHLSSupported={hlsState.isHLSSupported}
          availableQualities={hlsState.availableQualities}
          currentQuality={hlsState.currentQuality}
          onBack={handleBack}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onQualityChange={handleQualityChange}
          onToggleFullscreen={handleToggleFullscreen}
          onMenuOpen={handleMenuOpen}
        />
      </div>
    </div>
  );
};
