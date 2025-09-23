import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Subtitles, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Hls from 'hls.js';

interface VideoPlayerProps {
  streamUrl: string;
  poster?: string;
  title: string;
  movieId: string;
  subtitlesUrl?: string | null;
  isAdmin?: boolean;
  onClose?: () => void;
  useHLS?: boolean; // Flag to enable HLS streaming
}

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
  const hlsRef = useRef<Hls | null>(null);
  const router = useRouter();
  const [captionsOn, setCaptionsOn] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isHLSSupported, setIsHLSSupported] = useState(false);
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [hlsStats, setHlsStats] = useState<{
    loadedBytes: number;
    totalBytes: number;
    currentLevel: number;
  }>({ loadedBytes: 0, totalBytes: 0, currentLevel: -1 });
  const maxRetries = 3;

  // Create authenticated stream URL
  const getAuthenticatedStreamUrl = (isHLS: boolean = false) => {
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
  };

  // Initialize HLS player
  const initializeHLS = () => {
    const video = videoRef.current;
    if (!video) return;

    // Check if HLS is supported
    if (Hls.isSupported()) {
      setIsHLSSupported(true);
      
      // Create HLS instance with simplified config
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 3,
        maxFragLookUpTolerance: 0.25,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 1,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        testBandwidth: true,
        progressive: false,
        enableCEA708Captions: true,
        enableWebVTT: true,
        abrEwmaFastVoD: 3.0,
        abrEwmaSlowVoD: 9.0,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        maxStarvationDelay: 4,
        maxLoadingDelay: 4,
        minAutoBitrate: 0,
      });

      hlsRef.current = hls;

      // HLS event handlers
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('HLS manifest parsed, found', data.levels.length, 'quality levels');
        
        // Extract quality levels
        const qualities = data.levels.map((level, index) => {
          const height = level.height || 0;
          const bitrate = Math.round(level.bitrate / 1000);
          return {
            index,
            label: height > 0 ? `${height}p (${bitrate}k)` : `${bitrate}k`,
            height,
            bitrate
          };
        });

        // Sort by quality (highest first)
        qualities.sort((a, b) => b.height - a.height);
        setAvailableQualities(['auto', ...qualities.map(q => q.label)]);
        
        // Clear any previous errors on successful load
        setVideoError(null);
        setRetryCount(0);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const level = hls.levels[data.level];
        const quality = level ? `${level.height}p (${Math.round(level.bitrate / 1000)}k)` : `Level ${data.level}`;
        console.log(`🎬 Quality switched to: ${quality}`);
        console.log(`   Resolution: ${level?.width}x${level?.height}`);
        console.log(`   Bitrate: ${level ? Math.round(level.bitrate / 1000) : 'unknown'}k`);
        console.log(`   Codec: ${level?.codecSet || 'unknown'}`);
        setHlsStats(prev => ({ ...prev, currentLevel: data.level }));
      });

      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        setHlsStats(prev => ({
          ...prev,
          loadedBytes: prev.loadedBytes + (data.frag.byteLength || 0)
        }));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        
        // Handle non-fatal fragment errors by skipping to next segment
        if (!data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || 
              data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
              data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
            
            console.log(`Non-fatal fragment error (${data.details}), attempting to skip segment`);
            
            // Try to skip to next segment by advancing playhead slightly
            if (video && !video.paused) {
              const currentTime = video.currentTime;
              const segmentDuration = 6; // Our segments are 6 seconds
              const nextSegmentTime = Math.ceil(currentTime / segmentDuration) * segmentDuration;
              
              console.log(`Skipping from ${currentTime}s to ${nextSegmentTime}s`);
              video.currentTime = nextSegmentTime + 0.1; // Small offset to ensure we're in next segment
              
              // Continue playback
              video.play().catch(err => console.log('Play failed after segment skip:', err));
              return; // Don't treat as fatal
            }
          }
        }
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Fatal network error encountered, trying to recover');
              if (retryCount < maxRetries) {
                setRetryCount(prev => prev + 1);
                hls.startLoad();
              } else {
                setVideoError('Network error: Failed to load video after multiple attempts');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Fatal media error encountered, trying to recover');
              if (retryCount < maxRetries) {
                setRetryCount(prev => prev + 1);
                hls.recoverMediaError();
              } else {
                setVideoError('Media error: Unable to decode video');
              }
              break;
            default:
              console.log('Fatal error, cannot recover');
              setVideoError(`HLS Error: ${data.details}`);
              break;
          }
        }
      });

      // Load HLS stream
      const hlsUrl = getAuthenticatedStreamUrl(true);
      console.log('Loading HLS stream:', hlsUrl);
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      setIsHLSSupported(true);
      const hlsUrl = getAuthenticatedStreamUrl(true);
      console.log('Using native HLS support:', hlsUrl);
      video.src = hlsUrl;
    } else {
      // Fallback to regular MP4 streaming
      console.log('HLS not supported, falling back to MP4');
      setIsHLSSupported(false);
      const mp4Url = getAuthenticatedStreamUrl(false);
      video.src = mp4Url;
    }
  };

  // Initialize regular MP4 player
  const initializeMP4 = () => {
    const video = videoRef.current;
    if (!video) return;

    const authenticatedUrl = getAuthenticatedStreamUrl(false);
    video.src = authenticatedUrl;
    console.log('Loading MP4 stream:', authenticatedUrl);
  };

  // Handle quality change
  const handleQualityChange = (quality: string) => {
    if (!hlsRef.current) return;

    if (quality === 'auto') {
      hlsRef.current.currentLevel = -1; // Auto quality
    } else {
      const qualityIndex = availableQualities.indexOf(quality) - 1; // -1 because 'auto' is first
      if (qualityIndex >= 0) {
        hlsRef.current.currentLevel = qualityIndex;
      }
    }
    
    setCurrentQuality(quality);
    setShowQualityMenu(false);
  };

  // Video event handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.currentTime > 0) {
      localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
    }
  };

  const handleLoadStart = () => {
    setVideoError(null);
  };

  const handleLoadedMetadata = () => {
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
  };

  const handleError = () => {
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
      setVideoError(`${errorType}: ${errorMessage}`);
    }
  };

  const retryVideo = () => {
    if (retryCount >= maxRetries) {
      setVideoError('Failed to load video after multiple attempts');
      return;
    }
    
    console.log(`Retrying video load (attempt ${retryCount + 1}/${maxRetries})`);
    setRetryCount(prev => prev + 1);
    setVideoError(null);
    
    // Clean up existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    // Reinitialize based on settings
    if (useHLS) {
      initializeHLS();
    } else {
      initializeMP4();
    }
  };

  // Initialize player on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Add video event listeners
    const events = [
      ['loadstart', handleLoadStart],
      ['timeupdate', handleTimeUpdate],
      ['error', handleError],
      ['loadedmetadata', handleLoadedMetadata]
    ] as const;

    events.forEach(([event, handler]) => video.addEventListener(event, handler));

    // Initialize player based on settings
    if (useHLS) {
      initializeHLS();
    } else {
      initializeMP4();
    }

    console.log(`Player initialized: ${movieId}`);
    console.log(`Stream: ${streamUrl}`);
    console.log(`HLS enabled: ${useHLS}`);
    subtitlesUrl && console.log('Subtitles available');

    return () => {
      // Cleanup
      events.forEach(([event, handler]) => video.removeEventListener(event, handler));
      
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      console.log('Player unmounted');
    };
  }, [movieId, streamUrl, subtitlesUrl, useHLS]);

  const handleBack = () => {
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
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Control buttons container */}
      <div className="absolute top-4 left-4 z-50 flex gap-4">
        <button
          onClick={handleBack}
          className="flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 
                    text-white rounded-lg transition-colors backdrop-blur-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {subtitlesUrl && (
          <button
            onClick={() => {
              setCaptionsOn(!captionsOn);
              // Find and update the track element
              const track = videoRef.current?.textTracks[0];
              if (track) {
                track.mode = !captionsOn ? 'showing' : 'hidden';
              }
            }}
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
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className="flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 
                        text-white rounded-lg transition-colors backdrop-blur-sm"
              title="Quality settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            {showQualityMenu && (
              <div className="absolute top-12 left-0 bg-black/90 backdrop-blur-sm rounded-lg 
                            border border-gray-600 min-w-[120px] z-60">
                <div className="p-2">
                  <div className="text-white text-sm font-medium mb-2 px-2">Quality</div>
                  {availableQualities.map((quality) => (
                    <button
                      key={quality}
                      onClick={() => handleQualityChange(quality)}
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
            )}
          </div>
        )}
      </div>

      {/* HLS Stats (only show for admins) */}
      {isAdmin && isHLSSupported && hlsRef.current && (
        <div className="absolute top-4 right-4 z-50 bg-black/60 backdrop-blur-sm rounded-lg p-2 text-white text-xs max-w-xs">
          <div className="font-semibold mb-1">📊 HLS Stats</div>
          <div>Quality: {hlsStats.currentLevel >= 0 ? (() => {
            const level = hlsRef.current?.levels[hlsStats.currentLevel];
            return level ? `${level.height}p (${Math.round(level.bitrate / 1000)}k)` : hlsStats.currentLevel;
          })() : 'Auto'}</div>
          <div>Loaded: {(hlsStats.loadedBytes / 1024 / 1024).toFixed(1)}MB</div>
          <div>Levels: {hlsRef.current.levels.length}</div>
          <div>Buffer: {videoRef.current ? (() => {
            const video = videoRef.current;
            const buffered = video.buffered;
            if (buffered.length > 0) {
              const bufferEnd = buffered.end(buffered.length - 1);
              const bufferSeconds = bufferEnd - video.currentTime;
              return `${bufferSeconds.toFixed(1)}s`;
            }
            return '0s';
          })() : '0s'}</div>
          <div>Mode: {useHLS ? 'HLS' : 'MP4'}</div>
        </div>
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
              default={captionsOn}
            />
          )}
        </video>

        {/* Error overlay */}
        {videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <div className="text-red-400 text-lg mb-4">Video Error</div>
            <div className="text-white text-sm text-center mb-4 max-w-md">
              {videoError}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setVideoError(null);
                  setRetryCount(0);
                  retryVideo();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
              {useHLS && (
                <button
                  onClick={() => {
                    setVideoError(null);
                    setRetryCount(0);
                    // Fallback to MP4
                    if (hlsRef.current) {
                      hlsRef.current.destroy();
                      hlsRef.current = null;
                    }
                    initializeMP4();
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Use MP4
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};