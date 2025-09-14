import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Subtitles, Loader2, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useBufferManager } from '@/hooks/useBufferManager';
import { BufferVisualization } from './Buffer';

interface VideoPlayerProps {
  streamUrl: string;
  poster?: string;
  title: string;
  movieId: string;
  subtitlesUrl?: string | null;
  isAdmin?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  streamUrl, 
  poster, 
  title,
  movieId,
  subtitlesUrl,
  isAdmin = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();
  const [captionsOn, setCaptionsOn] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Debug-specific state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const debugLog = useRef<string[]>([]);
  const logLimit = 100; // Limit logs to prevent memory issues
  const maxRetries = 3;

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm format
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage); // Also output to console
    
    debugLog.current = [logMessage, ...debugLog.current.slice(0, logLimit - 1)];
  };

  // Initialize buffer manager
  const {
    isBuffering,
    bufferInfo,
    updateBufferInfo,
    handleWaiting,
    handlePlaying,
    handleProgress,
    resetBuffer,
    cleanup
  } = useBufferManager({
    videoRef,
    streamUrl,
    movieId,
    onDebugLog: addDebugLog
  });

  // Handle touch events for mobile
  const handleTouchStart = () => {
    setShowControls(true);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    controlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  // Optimized video event handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.currentTime > 0) {
      localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
      updateBufferInfo();
    }
  };

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video || retryCount >= maxRetries) {
      setVideoError('Failed to load video after multiple attempts');
      return;
    }
    
    addDebugLog(`Retrying video load (attempt ${retryCount + 1}/${maxRetries})`);
    setRetryCount(prev => prev + 1);
    
    const currentTime = video.currentTime;
    resetBuffer();
    
    // Set the authenticated URL again
    const authenticatedUrl = getAuthenticatedStreamUrl();
    video.src = authenticatedUrl;
    video.load();
    
    // Restore position after a short delay
    setTimeout(() => {
      if (video && currentTime > 0) {
        video.currentTime = currentTime;
      }
    }, 1000);
  };

  const handleError = () => {
    const video = videoRef.current;
    if (video?.error) {
      const errorCode = video.error.code;
      const errorMessage = video.error.message;
      addDebugLog(`Video error: ${errorCode} - ${errorMessage}`);
      
      const errorTypes = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK', 
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
      };
      
      const errorType = errorTypes[errorCode as keyof typeof errorTypes] || 'UNKNOWN';
      setVideoError(`${errorType}: ${errorMessage}`);
      
      // Handle specific error types with recovery
      if (errorCode === 2 && retryCount < maxRetries) { // MEDIA_ERR_NETWORK
        addDebugLog('Network error - will retry in 2 seconds');
        setTimeout(retryVideo, 2000);
      } else if (errorCode === 3) { // MEDIA_ERR_DECODE
        addDebugLog('Decode error - attempting buffer reset');
        resetBuffer();
      }
    }
  };

  const handleSeeking = () => {
    const video = videoRef.current;
    video && addDebugLog(`Seeking to ${video.currentTime.toFixed(2)}s`);
  };

  const handleSeeked = () => {
    const video = videoRef.current;
    if (video) {
      addDebugLog(`Seeked to ${video.currentTime.toFixed(2)}s`);
      handleProgress();
    }
  };

  const handleRateChange = () => {
    const video = videoRef.current;
    if (video) {
      addDebugLog(`Rate: ${video.playbackRate}x`);
      updateBufferInfo();
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    
    addDebugLog(`Metadata loaded. Duration: ${video.duration.toFixed(2)}s`);
    
    // Clear any previous errors on successful load
    setVideoError(null);
    setRetryCount(0);
    
    // Validate video source
    if (!video.duration || video.duration === Infinity || isNaN(video.duration)) {
      addDebugLog('Invalid video duration detected - source may be corrupted');
      setVideoError('Invalid video source - duration could not be determined');
      return;
    }
    
    // Restore saved position
    const savedPosition = localStorage.getItem(`video-position-${movieId}`);
    if (savedPosition) {
      const position = parseFloat(savedPosition);
      if (position > 0 && position < video.duration) {
        addDebugLog(`Restoring position: ${position.toFixed(2)}s`);
        video.currentTime = position;
      }
    }
    
    updateBufferInfo();
  };

  const handleCanPlayThrough = () => addDebugLog('Can play through');

  // Create authenticated stream URL
  const getAuthenticatedStreamUrl = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      addDebugLog('No authentication token found');
      return streamUrl;
    }
    
    const separator = streamUrl.includes('?') ? '&' : '?';
    return `${streamUrl}${separator}token=${encodeURIComponent(token)}`;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Set authenticated source
    const authenticatedUrl = getAuthenticatedStreamUrl();
    if (video.src !== authenticatedUrl) {
      video.src = authenticatedUrl;
      addDebugLog(`Updated video source with auth token`);
    }

    // Event listeners array for easier management
    const events = [
      ['waiting', handleWaiting],
      ['playing', handlePlaying],
      ['progress', handleProgress],
      ['timeupdate', handleTimeUpdate],
      ['error', handleError],
      ['seeking', handleSeeking],
      ['seeked', handleSeeked],
      ['ratechange', handleRateChange],
      ['loadedmetadata', handleLoadedMetadata],
      ['canplaythrough', handleCanPlayThrough]
    ] as const;

    // Add all event listeners
    events.forEach(([event, handler]) => video.addEventListener(event, handler));

    // Initial logs
    addDebugLog(`Player initialized: ${movieId}`);
    addDebugLog(`Stream: ${streamUrl}`);
    subtitlesUrl && addDebugLog('Subtitles available');

    return () => {
      // Remove all event listeners
      events.forEach(([event, handler]) => video.removeEventListener(event, handler));
      cleanup();
      addDebugLog('Player unmounted');
    };
  }, [movieId, streamUrl, subtitlesUrl]);

  const handleBack = () => {
    // Save the current playback position before navigating
    if (videoRef.current) {
      localStorage.setItem(
        `video-position-${movieId}`, 
        videoRef.current.currentTime.toString()
      );
    }

    // Clean up buffer manager
    cleanup();

    // Use window.location for a full page navigation
    window.location.href = `/movie/${movieId}`;
  };
  
  // Format time in MM:SS format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full" onTouchStart={handleTouchStart}>
      {/* Debug panel toggle - only for admins */}
      {isAdmin && (
        <button
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="absolute top-4 right-4 z-50 flex items-center gap-1 px-3 py-1.5 bg-black/60 hover:bg-black/80 
                    text-white rounded-lg transition-colors backdrop-blur-sm"
        >
          <Info className="w-4 h-4" />
          {showDebugPanel ? "Hide Debug" : "Show Debug"}
        </button>
      )}

      {/* Control buttons container */}
      <div className="absolute top-4 left-4 z-50 flex gap-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 bg-black/60 hover:bg-black/80 
                    text-white rounded-lg transition-colors backdrop-blur-sm"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Details
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
            className="flex items-center gap-2 px-4 py-2 bg-black/60 hover:bg-black/80 
                      text-white rounded-lg transition-colors backdrop-blur-sm"
          >
            <Subtitles className="w-5 h-5" />
            {captionsOn ? "Subtitles On" : "Subtitles Off"}
          </button>
        )}
      </div>

      <div className="relative">
        <video
          ref={videoRef}
          className="w-full aspect-video rounded-lg bg-gray-900"
          controls
          poster={poster}
          preload="auto"
          title={title}
          controlsList="nodownload"
          crossOrigin="anonymous"
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

        {/* Buffering overlay */}
        {isBuffering && !videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <div className="text-white text-sm">
              Buffering... {bufferInfo.bufferingStartTime && (
                <span>
                  ({Math.round((performance.now() - bufferInfo.bufferingStartTime) / 1000)}s)
                </span>
              )}
            </div>
            <div className="mt-2 text-gray-300 text-xs">
              ReadyState: {bufferInfo.readyState} / Loaded: {Math.round(bufferInfo.loadedPercentage)}%
            </div>
          </div>
        )}

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
              <button
                onClick={() => {
                  setVideoError(null);
                  setRetryCount(0);
                  resetBuffer();
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Debug panel - only shown for admins */}
      {isAdmin && showDebugPanel && (
        <div className="mt-4 p-4 bg-gray-900 border border-gray-700 rounded-lg">
          <h3 className="text-lg font-medium text-white mb-2">Player Debug Information</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-1">Playback</h4>
              <div className="space-y-1 text-sm text-gray-400">
                <p>Time: {bufferInfo.current.toFixed(2)}s / {bufferInfo.duration.toFixed(2)}s</p>
                <p>State: {['NOTHING', 'METADATA', 'CURRENT', 'FUTURE', 'ENOUGH'][bufferInfo.readyState] || 'UNKNOWN'}</p>
                <p>Rate: {bufferInfo.playbackRate}x</p>
                <p>Buffering: {bufferInfo.isBuffering ? `Yes (${bufferInfo.bufferingCount}x)` : 'No'}</p>
                <p>Total Buffer Time: {(bufferInfo.totalBufferingTime / 1000).toFixed(1)}s</p>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-1">Buffer</h4>
              <div className="space-y-1 text-sm text-gray-400">
                <p>Loaded: {bufferInfo.loadedPercentage.toFixed(1)}%</p>
                <p>Ranges: {bufferInfo.ranges.length}</p>
                {bufferInfo.ranges.slice(0, 3).map((range, i) => (
                  <p key={i} className="text-xs">
                    {i+1}: {range.start.toFixed(1)}s-{range.end.toFixed(1)}s ({(range.end - range.start).toFixed(1)}s)
                  </p>
                ))}
                {bufferInfo.ranges.length > 3 && <p className="text-xs">...and {bufferInfo.ranges.length - 3} more</p>}
                {bufferInfo.lastError && (
                  <p className="text-red-400 text-xs">Error: {bufferInfo.lastError}</p>
                )}
              </div>
            </div>
          </div>
          
          <h4 className="text-sm font-medium text-gray-300 mb-1">Buffer Visualization</h4>
          <BufferVisualization bufferInfo={bufferInfo} formatTime={formatTime} />
          
          <h4 className="text-sm font-medium text-gray-300 mt-4 mb-1">Network Activity</h4>
          <div className="grid grid-cols-4 gap-1 mb-2 max-h-20 overflow-y-auto">
            {Array.from(bufferInfo.requestStatus).slice(-12).map(([range, status], i) => (
              <div 
                key={i} 
                className={`text-xs px-1 py-0.5 rounded text-center ${
                  status === 'completed' ? 'bg-green-900 text-green-300' : 
                  status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 
                  'bg-red-900 text-red-300'
                }`}
                title={`${range}: ${status}`}
              >
                {status[0].toUpperCase()}
              </div>
            ))}
          </div>
          
          <h4 className="text-sm font-medium text-gray-300 mt-4 mb-1">Debug Log</h4>
          <div className="bg-gray-950 p-2 rounded-lg h-32 overflow-y-auto font-mono text-xs">
            {debugLog.current.slice(0, 20).map((log, i) => (
              <div key={i} className="text-gray-300 leading-tight">
                {log}
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex justify-between">
            <button
              onClick={() => {
                debugLog.current = [];
                addDebugLog('Debug data cleared');
              }}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded"
            >
              Clear Debug Data
            </button>
            
            <button
              onClick={() => {
                addDebugLog('Resetting buffer state...');
                resetBuffer();
              }}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-sm rounded"
            >
              Reset Buffer
            </button>
            
            <button
              onClick={() => {
                // Force rebuffering
                if (videoRef.current) {
                  const video = videoRef.current;
                  const currentTime = video.currentTime;
                  addDebugLog(`Forcing rebuffer by seeking to ${currentTime.toFixed(2)}s`);
                  video.currentTime = currentTime + 0.1;
                }
              }}
              className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded"
            >
              Force Rebuffer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};