'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { VideoPlayerProps, VideoPlayerState, HLSStats } from './types';
import { HLSManager } from './HLSManager';
import { VideoControls } from './VideoControls';
import { ErrorOverlay } from './ErrorOverlay';
import { HLSStatsOverlay } from './HLSStatsOverlay';

const FF_SPEEDS = [2, 4, 8, 16] as const;
// seconds to seek backward per 100 ms interval — gives ~2x/4x/8x/16x effective rewind
const RW_STEPS = [0.2, 0.4, 0.8, 1.6] as const;
const RW_LABELS = ['2x', '4x', '8x', '16x'] as const;

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  streamUrl, 
  poster, 
  title,
  movieId,
  subtitlesUrl,
  isAdmin = false,
  onClose,
  useHLS = true
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsManagerRef = useRef<HLSManager | null>(null);
  const router = useRouter();
  
  // Seek mode (ff/rw) — stored in refs to avoid stale closures in interval/keydown handlers
  const seekModeRef = useRef<'none' | 'ff' | 'rw'>('none');
  const seekSpeedIndexRef = useRef(0);
  const seekIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [seekDisplay, setSeekDisplay] = useState<string | null>(null);

  const [state, setState] = useState<VideoPlayerState>({
    captionsOn: false,
    videoError: null,
    retryCount: 0,
    isHLSSupported: false,
    availableQualities: [],
    currentQuality: 'auto',
    showQualityMenu: false,
    hlsStats: { loadedBytes: 0, totalBytes: 0, currentLevel: -1 }
  });

  const maxRetries = 3;

  // Create authenticated stream URL
  const getAuthenticatedStreamUrl = useCallback((isHLS: boolean = false) => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No authentication token found');
      return streamUrl;
    }
    
    console.log('Retrieved token from localStorage:', token.substring(0, 20) + '...');
    
    // For HLS, use the HLS API endpoint
    const baseUrl = isHLS ? `/api/hls/${movieId}` : streamUrl;
    const separator = baseUrl.includes('?') ? '&' : '?';
    const authenticatedUrl = `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    
    console.log('Generated authenticated URL:', authenticatedUrl);
    return authenticatedUrl;
  }, [movieId, streamUrl]);

  // HLS Manager callbacks
  const handleHLSError = useCallback((error: string) => {
    setState(prev => ({ ...prev, videoError: error }));
  }, []);

  const handleHLSStatsUpdate = useCallback((stats: Partial<HLSStats>) => {
    setState(prev => ({ 
      ...prev, 
      hlsStats: { ...prev.hlsStats, ...stats }
    }));
  }, []);

  const handleHLSQualitiesUpdate = useCallback((qualities: string[]) => {
    setState(prev => ({ 
      ...prev, 
      availableQualities: qualities,
      isHLSSupported: true
    }));
  }, []);

  // Initialize player
  const initializePlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (useHLS) {
      // Initialize HLS Manager
      hlsManagerRef.current = new HLSManager({
        movieId,
        videoRef,
        onError: handleHLSError,
        onStatsUpdate: handleHLSStatsUpdate,
        onQualitiesUpdate: handleHLSQualitiesUpdate,
        getAuthenticatedUrl: getAuthenticatedStreamUrl
      });

      const hlsSupported = hlsManagerRef.current.initialize();
      if (!hlsSupported) {
        // Fallback to MP4
        console.log('HLS not supported, falling back to MP4');
        initializeMP4();
      }
    } else {
      initializeMP4();
    }
  }, [useHLS, movieId, getAuthenticatedStreamUrl, handleHLSError, handleHLSStatsUpdate, handleHLSQualitiesUpdate]);

  // Initialize regular MP4 player
  const initializeMP4 = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setState(prev => ({ ...prev, isHLSSupported: false }));
    const authenticatedUrl = getAuthenticatedStreamUrl(false);
    video.src = authenticatedUrl;
    console.log('Loading MP4 stream:', authenticatedUrl);
  }, [getAuthenticatedStreamUrl]);

  // Video event handlers
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
    
    console.log(`Metadata loaded. Duration: ${video.duration.toFixed(2)}s`);
    
    // Restore saved position
    const savedPosition = localStorage.getItem(`video-position-${movieId}`);
    if (savedPosition) {
      const position = parseFloat(savedPosition);
      if (position > 0 && position < video.duration) {
        console.log(`Restoring position: ${position.toFixed(2)}s`);
        video.currentTime = position;
      }
    }
  }, [movieId]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (video?.error) {
      const errorCode = video.error.code;
      const errorMessage = video.error.message;
      console.log(`Video error: ${errorCode} - ${errorMessage}`);
      
      const errorTypes = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK', 
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
      };
      
      const errorType = errorTypes[errorCode as keyof typeof errorTypes] || 'UNKNOWN';
      setState(prev => ({ ...prev, videoError: `${errorType}: ${errorMessage}` }));
    }
  }, []);

  // Seek mode helpers
  const stopSeekMode = useCallback(() => {
    const video = videoRef.current;
    if (seekIntervalRef.current) {
      clearInterval(seekIntervalRef.current);
      seekIntervalRef.current = null;
    }
    if (video) {
      if (seekModeRef.current === 'ff') video.playbackRate = 1;
      else if (seekModeRef.current === 'rw') video.play();
    }
    seekModeRef.current = 'none';
    seekSpeedIndexRef.current = 0;
    setSeekDisplay(null);
  }, []);

  // Control handlers
  const handleBack = useCallback(() => {
    // Save the current playback position before navigating
    if (videoRef.current) {
      localStorage.setItem(
        `video-position-${movieId}`, 
        videoRef.current.currentTime.toString()
      );
    }

    // Use onClose if provided, otherwise fallback to navigation
    if (onClose) {
      onClose();
    } else {
      window.location.href = `/movie/${movieId}`;
    }
  }, [movieId, onClose]);

  const handleToggleCaptions = useCallback(() => {
    setState(prev => ({ ...prev, captionsOn: !prev.captionsOn }));
    
    // Find and update the track element
    const track = videoRef.current?.textTracks[0];
    if (track) {
      track.mode = !state.captionsOn ? 'showing' : 'hidden';
    }
  }, [state.captionsOn]);

  const handleToggleQualityMenu = useCallback(() => {
    setState(prev => ({ ...prev, showQualityMenu: !prev.showQualityMenu }));
  }, []);

  const handleQualityChange = useCallback((quality: string) => {
    if (hlsManagerRef.current) {
      hlsManagerRef.current.setQuality(quality);
    }
    setState(prev => ({ 
      ...prev, 
      currentQuality: quality,
      showQualityMenu: false
    }));
  }, []);

  const handleRetry = useCallback(() => {
    if (state.retryCount >= maxRetries) {
      setState(prev => ({ ...prev, videoError: 'Failed to load video after multiple attempts' }));
      return;
    }
    
    console.log(`Retrying video load (attempt ${state.retryCount + 1}/${maxRetries})`);
    setState(prev => ({ 
      ...prev, 
      retryCount: prev.retryCount + 1,
      videoError: null
    }));
    
    // Clean up existing HLS instance
    if (hlsManagerRef.current) {
      hlsManagerRef.current.destroy();
      hlsManagerRef.current = null;
    }
    
    // Reinitialize
    initializePlayer();
  }, [state.retryCount, maxRetries, initializePlayer]);

  const handleFallbackToMP4 = useCallback(() => {
    setState(prev => ({ ...prev, videoError: null, retryCount: 0 }));
    
    // Clean up HLS
    if (hlsManagerRef.current) {
      hlsManagerRef.current.destroy();
      hlsManagerRef.current = null;
    }
    
    initializeMP4();
  }, [initializeMP4]);

  // Remote / keyboard controls
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const video = videoRef.current;
    if (!video) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        stopSeekMode();
        handleBack();
        break;

      case 'Enter': {
        // Let focused buttons handle their own Enter press
        if ((document.activeElement as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (seekModeRef.current !== 'none') {
          stopSeekMode();
        } else {
          video.paused ? video.play() : video.pause();
        }
        break;
      }

      case 'ArrowRight': {
        e.preventDefault();
        if (seekModeRef.current === 'rw') {
          // Switch rw → ff
          if (seekIntervalRef.current) { clearInterval(seekIntervalRef.current); seekIntervalRef.current = null; }
          seekModeRef.current = 'ff';
          seekSpeedIndexRef.current = 0;
        } else if (seekModeRef.current === 'ff') {
          seekSpeedIndexRef.current = Math.min(seekSpeedIndexRef.current + 1, FF_SPEEDS.length - 1);
        } else {
          seekModeRef.current = 'ff';
          seekSpeedIndexRef.current = 0;
        }
        const ffSpeed = FF_SPEEDS[seekSpeedIndexRef.current];
        video.playbackRate = ffSpeed;
        if (video.paused) video.play();
        setSeekDisplay(`⏩ ${ffSpeed}x`);
        break;
      }

      case 'ArrowLeft': {
        e.preventDefault();
        if (seekModeRef.current === 'ff') {
          // Switch ff → rw
          video.playbackRate = 1;
          video.pause();
          seekModeRef.current = 'rw';
          seekSpeedIndexRef.current = 0;
        } else if (seekModeRef.current === 'rw') {
          seekSpeedIndexRef.current = Math.min(seekSpeedIndexRef.current + 1, RW_STEPS.length - 1);
          if (seekIntervalRef.current) { clearInterval(seekIntervalRef.current); seekIntervalRef.current = null; }
        } else {
          video.pause();
          seekModeRef.current = 'rw';
          seekSpeedIndexRef.current = 0;
        }
        const step = RW_STEPS[seekSpeedIndexRef.current];
        setSeekDisplay(`⏪ ${RW_LABELS[seekSpeedIndexRef.current]}`);
        seekIntervalRef.current = setInterval(() => {
          const v = videoRef.current;
          if (!v) return;
          const next = v.currentTime - step;
          if (next <= 0) { v.currentTime = 0; stopSeekMode(); }
          else v.currentTime = next;
        }, 100);
        break;
      }
    }
  }, [handleBack, stopSeekMode]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (seekIntervalRef.current) clearInterval(seekIntervalRef.current);
    };
  }, [handleKeyDown]);

  // Initialize player on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Add video event listeners
    const events = [
      ['loadstart', handleLoadStart],
      ['timeupdate', handleTimeUpdate],
      ['error', handleVideoError],
      ['loadedmetadata', handleLoadedMetadata]
    ] as const;

    events.forEach(([event, handler]) => video.addEventListener(event, handler));

    // Initialize player
    initializePlayer();

    console.log(`Player initialized: ${movieId}`);
    console.log(`Stream: ${streamUrl}`);
    console.log(`HLS enabled: ${useHLS}`);
    subtitlesUrl && console.log('Subtitles available');

    return () => {
      // Cleanup
      events.forEach(([event, handler]) => video.removeEventListener(event, handler));
      
      if (hlsManagerRef.current) {
        hlsManagerRef.current.destroy();
        hlsManagerRef.current = null;
      }
      
      console.log('Player unmounted');
    };
  }, [movieId, streamUrl, subtitlesUrl, useHLS, initializePlayer, handleLoadStart, handleTimeUpdate, handleVideoError, handleLoadedMetadata]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Control buttons container */}
      <VideoControls
        onBack={handleBack}
        subtitlesUrl={subtitlesUrl}
        captionsOn={state.captionsOn}
        onToggleCaptions={handleToggleCaptions}
        isHLSSupported={state.isHLSSupported}
        availableQualities={state.availableQualities}
        currentQuality={state.currentQuality}
        showQualityMenu={state.showQualityMenu}
        onToggleQualityMenu={handleToggleQualityMenu}
        onQualityChange={handleQualityChange}
      />

      {/* HLS Stats (only show for admins) */}
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
          style={{
            backgroundColor: 'transparent',
            objectFit: 'contain',
            objectPosition: 'center'
          }}
        >
          {subtitlesUrl && (
            <track 
              kind="subtitles" 
              src={subtitlesUrl} 
              srcLang="en" 
              label="English"
              default={state.captionsOn}
            />
          )}
        </video>

        {/* Seek mode OSD */}
        {seekDisplay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="bg-black/70 text-white text-5xl font-bold px-10 py-5 rounded-2xl backdrop-blur-sm">
              {seekDisplay}
            </div>
          </div>
        )}

        {/* Error overlay */}
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