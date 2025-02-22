import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Subtitles, Loader2, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface VideoPlayerProps {
  streamUrl: string;
  poster?: string;
  title: string;
  movieId: string;
  subtitlesUrl?: string | null;
  isAdmin?: boolean;
}

interface BufferInfo {
  ranges: { start: number; end: number }[];
  current: number;
  isBuffering: boolean;
  duration: number;
  loadedPercentage: number;
  requestStatus: Map<string, 'pending' | 'completed' | 'failed'>;
  lastError?: string;
  playbackRate: number;
  readyState: number;
  bufferingStartTime?: number;
  bufferingCount: number;
  bufferingDurations: number[];
  totalBufferingTime: number;
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
  const [isBuffering, setIsBuffering] = useState(false);
  const bufferingTimeout = useRef<number>();
  const activeRequests = useRef(new Map<string, AbortController>());
  const completedRanges = useRef(new Set<string>());
  const router = useRouter();
  const [captionsOn, setCaptionsOn] = useState(false);
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Debug-specific state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [bufferInfo, setBufferInfo] = useState<BufferInfo>({
    ranges: [],
    current: 0,
    isBuffering: false,
    duration: 0,
    loadedPercentage: 0,
    requestStatus: new Map(),
    playbackRate: 1,
    readyState: 0,
    bufferingCount: 0,
    bufferingDurations: [],
    totalBufferingTime: 0
  });
  const lastBufferingTime = useRef<number | null>(null);
  const debugLog = useRef<string[]>([]);
  const logLimit = 100; // Limit logs to prevent memory issues

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm format
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage); // Also output to console
    
    debugLog.current = [logMessage, ...debugLog.current.slice(0, logLimit - 1)];
  };

  const updateBufferInfo = () => {
    const video = videoRef.current;
    if (!video) return;

    const ranges: { start: number; end: number }[] = [];
    for (let i = 0; i < video.buffered.length; i++) {
      ranges.push({
        start: video.buffered.start(i),
        end: video.buffered.end(i)
      });
    }

    // Calculate loaded percentage
    let loadedPercentage = 0;
    if (video.duration) {
      const totalBuffered = ranges.reduce((acc, range) => {
        return acc + (range.end - range.start);
      }, 0);
      loadedPercentage = (totalBuffered / video.duration) * 100;
    }

    setBufferInfo(prev => ({
      ...prev,
      ranges,
      current: video.currentTime,
      duration: video.duration,
      isBuffering,
      loadedPercentage,
      playbackRate: video.playbackRate,
      readyState: video.readyState
    }));
  };

  const isRangeLoaded = (start: number, end: number) => {
    for (const range of completedRanges.current) {
      const [loadedStart, loadedEnd] = range.split('-').map(Number);
      if (start <= loadedEnd && end >= loadedStart) {
        addDebugLog(`Range ${start}-${end} already loaded in ${loadedStart}-${loadedEnd}`);
        return true;
      }
    }
    return false;
  };

  const fetchChunk = async (start: number, end: number, isPreload = false) => {
    const rangeKey = `${start}-${end}`;
    
    if (activeRequests.current.has(rangeKey)) {
      addDebugLog(`Request for ${rangeKey} already in progress`);
      return;
    }
  
    if (isRangeLoaded(start, end)) {
      addDebugLog(`Range ${rangeKey} already loaded`);
      return;
    }
  
    addDebugLog(`Requesting chunk: ${rangeKey} ${isPreload ? "(preload)" : ""}`);
    
    const controller = new AbortController();
    activeRequests.current.set(rangeKey, controller);
    
    // Update buffer info with pending request
    setBufferInfo(prev => {
      const newRequestStatus = new Map(prev.requestStatus);
      newRequestStatus.set(rangeKey, 'pending');
      return { ...prev, requestStatus: newRequestStatus };
    });
  
    try {
      // Construct URL safely without using URL constructor
      const baseUrl = streamUrl.startsWith('/') ? streamUrl : `/${streamUrl}`;
      const separator = baseUrl.includes('?') ? '&' : '?';
      const queryParams = `range=${rangeKey}${isPreload ? '&preload=true' : ''}`;
      const fullUrl = `${baseUrl}${separator}${queryParams}`;
  
      const startTime = performance.now();
      const response = await fetch(fullUrl, {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        }
      });
      const endTime = performance.now();
      const fetchTime = Math.round(endTime - startTime);
  
      if (response.ok) {
        addDebugLog(`Loaded chunk: ${rangeKey} in ${fetchTime}ms`);
        completedRanges.current.add(rangeKey);
        
        // Update buffer info with completed request
        setBufferInfo(prev => {
          const newRequestStatus = new Map(prev.requestStatus);
          newRequestStatus.set(rangeKey, 'completed');
          return { ...prev, requestStatus: newRequestStatus };
        });
      } else {
        throw new Error(`HTTP error: ${response.status}`);
      }
    } catch (error: unknown) {
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.name === 'AbortError' 
          ? `Request for ${rangeKey} aborted` 
          : `Error loading chunk ${rangeKey}: ${error.message}`;
      }
      
      addDebugLog(errorMessage);
      
      // Update buffer info with failed request
      setBufferInfo(prev => {
        const newRequestStatus = new Map(prev.requestStatus);
        newRequestStatus.set(rangeKey, 'failed');
        return { 
          ...prev, 
          requestStatus: newRequestStatus,
          lastError: errorMessage
        };
      });
    } finally {
      activeRequests.current.delete(rangeKey);
    }
  };

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

  const tryResumePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
  
    addDebugLog(`Attempting to resume playback. ReadyState: ${video.readyState}`);
    
    try {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        await playPromise;
        addDebugLog("Playback resumed successfully");
        setIsBuffering(false);
        
        // Update buffer info when buffering ends
        if (lastBufferingTime.current !== null) {
          const bufferDuration = performance.now() - lastBufferingTime.current;
          setBufferInfo(prev => {
            const newBufferingDurations = [...prev.bufferingDurations, bufferDuration];
            return {
              ...prev,
              bufferingDurations: newBufferingDurations,
              totalBufferingTime: prev.totalBufferingTime + bufferDuration
            };
          });
          lastBufferingTime.current = null;
        }
      }
    } catch (error) {
      let errorMessage = 'Unknown error during playback resume';
      if (error instanceof Error) {
        errorMessage = `Playback resume failed: ${error.message}`;
      }
      addDebugLog(errorMessage);
      
      // Try again after a delay
      setTimeout(tryResumePlayback, 1000);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const savedPosition = localStorage.getItem(`video-position-${movieId}`);
    if (savedPosition) {
      const position = parseFloat(savedPosition);
      addDebugLog(`Restoring playback position to ${position.toFixed(2)}s`);
      video.currentTime = position;
    }

    // Setup periodic buffer info updates
    const bufferInfoInterval = setInterval(() => {
      updateBufferInfo();
    }, 500);

    const handleWaiting = () => {
      addDebugLog(`Video waiting for data at ${video.currentTime.toFixed(2)}s - ReadyState: ${video.readyState}`);
      setIsBuffering(true);
      
      // Record buffering start time
      if (lastBufferingTime.current === null) {
        const now = performance.now();
        lastBufferingTime.current = now;
        setBufferInfo(prev => ({
          ...prev,
          bufferingCount: prev.bufferingCount + 1,
          bufferingStartTime: now
        }));
      }
    
      const currentTime = video.currentTime;
      
      // First check if we already have the data in buffer
      let hasBufferedData = false;
      for (let i = 0; i < video.buffered.length; i++) {
        const start = video.buffered.start(i);
        const end = video.buffered.end(i);
        
        // If current time is within a buffered range and we have at least 2 seconds ahead
        if (currentTime >= start && currentTime + 2 < end) {
          hasBufferedData = true;
          addDebugLog(`Data already buffered from ${start.toFixed(2)}s to ${end.toFixed(2)}s`);
          break;
        }
      }
      
      if (hasBufferedData) {
        addDebugLog('Attempting to skip buffering since data is available');
        tryResumePlayback();
        return;
      }
      
      // Calculate byte position based on current time
      const kbps = (CHUNK_SIZE / 8) * (video.duration ? (1 / video.duration) : 0.1); // Rough estimate of data rate
      const startByte = Math.floor(currentTime * kbps);
      const endByte = startByte + CHUNK_SIZE - 1;
      
      addDebugLog(`Fetching chunk for position ${currentTime.toFixed(2)}s (bytes ${startByte}-${endByte})`);
      
      // Fetch the needed chunk
      fetchChunk(startByte, endByte).then(() => {
        addDebugLog('Checking buffer status after fetch');
        
        // Define a more robust check and retry mechanism
        const checkBufferAndResume = () => {
          if (!videoRef.current) return;
          
          const video = videoRef.current;
          updateBufferInfo(); // Update buffer visualization
          
          // Check if we have enough data to resume
          let canResume = false;
          for (let i = 0; i < video.buffered.length; i++) {
            const start = video.buffered.start(i);
            const end = video.buffered.end(i);
            
            // If we have at least 2 seconds of data ahead of current position
            if (video.currentTime >= start && video.currentTime + 2 < end) {
              canResume = true;
              addDebugLog(`Sufficient data buffered: ${start.toFixed(2)}s to ${end.toFixed(2)}s`);
              break;
            }
          }
          
          if (canResume || video.readyState >= 3) {
            addDebugLog(`Buffered enough to resume playback (readyState: ${video.readyState})`);
            tryResumePlayback();
          } else {
            addDebugLog(`Still buffering (readyState: ${video.readyState}), retrying...`);
            bufferingTimeout.current = window.setTimeout(checkBufferAndResume, 500);
          }
        };
        
        checkBufferAndResume();
      });
    };

    const handlePlaying = () => {
      addDebugLog(`Video resumed playing at ${video.currentTime.toFixed(2)}s`);
      if (bufferingTimeout.current) {
        window.clearTimeout(bufferingTimeout.current);
      }
      setIsBuffering(false);
      
      // Record end of buffering period
      if (lastBufferingTime.current !== null) {
        const bufferDuration = performance.now() - lastBufferingTime.current;
        addDebugLog(`Buffering lasted ${bufferDuration.toFixed(0)}ms`);
        
        setBufferInfo(prev => {
          const newBufferingDurations = [...prev.bufferingDurations, bufferDuration];
          return {
            ...prev,
            bufferingDurations: newBufferingDurations,
            totalBufferingTime: prev.totalBufferingTime + bufferDuration,
            bufferingStartTime: undefined
          };
        });
        
        lastBufferingTime.current = null;
      }
    };

    const handleProgress = () => {
      const video = videoRef.current;
      if (!video) return;
    
      const buffered = video.buffered;
      const currentTime = video.currentTime;
      
      // Log current buffer state
      let bufferMessage = 'Buffer ranges: ';
      for (let i = 0; i < buffered.length; i++) {
        const start = buffered.start(i);
        const end = buffered.end(i);
        bufferMessage += `[${start.toFixed(2)}-${end.toFixed(2)}s] `;
      }
      addDebugLog(bufferMessage);
    
      // Fetch ahead if needed
      for (let i = 0; i < buffered.length; i++) {
        const bufferStart = buffered.start(i);
        const bufferEnd = buffered.end(i);
    
        // Fetch next chunk if we have less than 15 seconds of buffer remaining
        if (currentTime >= bufferStart && bufferEnd - currentTime < 15) {
          // Calculate byte position 
          const kbps = (CHUNK_SIZE / 8) * (video.duration ? (1 / video.duration) : 0.1);
          const startByte = Math.floor(bufferEnd * kbps);
          const endByte = startByte + CHUNK_SIZE - 1;
          
          addDebugLog(`Preloading next chunk from ${bufferEnd.toFixed(2)}s (bytes ${startByte}-${endByte})`);
          fetchChunk(startByte, endByte, true);
        }
      }
      
      updateBufferInfo();
    };

    const handleTimeUpdate = () => {
      if (video.currentTime > 0) {
        localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
      }
      updateBufferInfo();
    };

    const handleError = () => {
      const error = video.error;
      if (error) {
        const errorDetails = `Video error: Code ${error.code}, Message: ${error.message}`;
        addDebugLog(errorDetails);
        
        setBufferInfo(prev => ({
          ...prev,
          lastError: errorDetails
        }));
      }
    };

    const handleSeeking = () => {
      addDebugLog(`Seeking to ${video.currentTime.toFixed(2)}s`);
    };

    const handleSeeked = () => {
      addDebugLog(`Seeked to ${video.currentTime.toFixed(2)}s`);
      
      // Check if we need to fetch data for this position
      handleProgress();
    };

    const handleRateChange = () => {
      addDebugLog(`Playback rate changed to ${video.playbackRate}`);
      updateBufferInfo();
    };

    const handleLoadedMetadata = () => {
      addDebugLog(`Video metadata loaded. Duration: ${video.duration.toFixed(2)}s`);
      updateBufferInfo();
    };

    const handleCanPlayThrough = () => {
      addDebugLog('Video can play through without buffering');
    };

    // Add event listeners
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('error', handleError);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ratechange', handleRateChange);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplaythrough', handleCanPlayThrough);

    // Initial log
    addDebugLog(`VideoPlayer initialized for movie ID: ${movieId}`);
    addDebugLog(`Stream URL: ${streamUrl}`);
    addDebugLog(`Has subtitles: ${subtitlesUrl ? 'Yes' : 'No'}`);

    return () => {
      clearInterval(bufferInfoInterval);
      
      if (bufferingTimeout.current) {
        window.clearTimeout(bufferingTimeout.current);
      }

      activeRequests.current.forEach(controller => controller.abort());
      activeRequests.current.clear();
      
      // Remove event listeners
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('error', handleError);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('ratechange', handleRateChange);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      
      // Save position
      if (video.currentTime > 0) {
        localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
      }
      
      addDebugLog('VideoPlayer component unmounted');
    };
  }, [movieId, streamUrl]);

  const handleBack = () => {
    // Save the current playback position before navigating
    if (videoRef.current) {
      localStorage.setItem(
        `video-position-${movieId}`, 
        videoRef.current.currentTime.toString()
      );
    }

    // Clean up any active requests and timeouts
    activeRequests.current.forEach(controller => controller.abort());
    activeRequests.current.clear();
    
    if (bufferingTimeout.current) {
      window.clearTimeout(bufferingTimeout.current);
    }

    // Use window.location for a full page navigation
    window.location.href = `/movie/${movieId}`;
  };

  // Debug buffer visualization component
  const BufferVisualization = () => {
    const { ranges, current, duration } = bufferInfo;
    
    if (!duration) return null;
    
    return (
      <div className="mt-2 relative w-full h-6 bg-gray-800 rounded overflow-hidden">
        {/* Buffer ranges */}
        {ranges.map((range, index) => {
          const startPercent = (range.start / duration) * 100;
          const widthPercent = ((range.end - range.start) / duration) * 100;
          
          return (
            <div 
              key={index}
              className="absolute h-full bg-blue-600 opacity-70"
              style={{ 
                left: `${startPercent}%`, 
                width: `${widthPercent}%`
              }}
            />
          );
        })}
        
        {/* Current position */}
        <div 
          className="absolute w-1 h-full bg-white"
          style={{ left: `${(current / duration) * 100}%` }}
        />
        
        {/* Time markers */}
        <div className="absolute inset-0 flex justify-between px-2 text-xs text-white">
          <span>{formatTime(0)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    );
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
          <source src={streamUrl} type="video/mp4" />
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
        {isBuffering && (
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
      </div>

      {/* Debug panel - only shown for admins */}
      {isAdmin && showDebugPanel && (
        <div className="mt-4 p-4 bg-gray-900 border border-gray-700 rounded-lg">
          <h3 className="text-lg font-medium text-white mb-2">Player Debug Information</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-1">Playback Status</h4>
              <div className="space-y-1 text-sm">
                <p>Current Time: {bufferInfo.current.toFixed(2)}s</p>
                <p>Duration: {bufferInfo.duration.toFixed(2)}s</p>
                <p>Ready State: {bufferInfo.readyState} ({
                  bufferInfo.readyState === 0 ? 'HAVE_NOTHING' : 
                  bufferInfo.readyState === 1 ? 'HAVE_METADATA' :
                  bufferInfo.readyState === 2 ? 'HAVE_CURRENT_DATA' :
                  bufferInfo.readyState === 3 ? 'HAVE_FUTURE_DATA' : 'HAVE_ENOUGH_DATA'
                })</p>
                <p>Playback Rate: {bufferInfo.playbackRate}x</p>
                <p>Buffering: {bufferInfo.isBuffering ? `Yes (${bufferInfo.bufferingCount} times)` : 'No'}</p>
                <p>Total Buffering Time: {(bufferInfo.totalBufferingTime / 1000).toFixed(1)}s</p>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-1">Buffer Status</h4>
              <div className="space-y-1 text-sm">
                <p>Loaded: {bufferInfo.loadedPercentage.toFixed(1)}%</p>
                <p>Buffer Ranges: {bufferInfo.ranges.length}</p>
                {bufferInfo.ranges.map((range, i) => (
                  <p key={i} className="text-xs">
                    Range {i+1}: {range.start.toFixed(2)}s - {range.end.toFixed(2)}s 
                    ({(range.end - range.start).toFixed(2)}s)
                  </p>
                ))}
                {bufferInfo.lastError && (
                  <p className="text-red-400">Last Error: {bufferInfo.lastError}</p>
                )}
              </div>
            </div>
          </div>
          
          <h4 className="text-sm font-medium text-gray-300 mb-1">Buffer Visualization</h4>
          <BufferVisualization />
          
          <h4 className="text-sm font-medium text-gray-300 mt-4 mb-1">Recent Network Activity</h4>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {Array.from(bufferInfo.requestStatus).map(([range, status], i) => (
              <div 
                key={i} 
                className={`text-xs px-2 py-1 rounded ${
                  status === 'completed' ? 'bg-green-900 text-green-300' : 
                  status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 
                  'bg-red-900 text-red-300'
                }`}
              >
                {range}: {status}
              </div>
            ))}
          </div>
          
          <h4 className="text-sm font-medium text-gray-300 mt-4 mb-1">Debug Log</h4>
          <div className="bg-gray-950 p-2 rounded-lg h-40 overflow-y-auto font-mono text-xs">
            {debugLog.current.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap break-all text-gray-300">
                {log}
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex justify-between">
            <button
              onClick={() => {
                debugLog.current = [];
                setBufferInfo(prev => ({
                  ...prev,
                  bufferingCount: 0,
                  bufferingDurations: [],
                  totalBufferingTime: 0,
                  requestStatus: new Map(),
                  lastError: undefined
                }));
              }}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded"
            >
              Clear Debug Data
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