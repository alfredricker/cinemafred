import { useRef, useState, useCallback, useEffect } from 'react';

export interface BufferRange {
  start: number;
  end: number;
}

export interface BufferInfo {
  ranges: BufferRange[];
  current: number;
  isBuffering: boolean;
  duration: number;
  loadedPercentage: number;
  requestStatus: Map<string, 'pending' | 'completed' | 'failed' | 'skipped'>;
  lastError?: string;
  playbackRate: number;
  readyState: number;
  bufferingStartTime?: number;
  bufferingCount: number;
  bufferingDurations: number[];
  totalBufferingTime: number;
}

interface UseBufferManagerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  streamUrl: string;
  movieId: string;
  chunkSize?: number;
  maxCachedChunks?: number;
  onDebugLog?: (message: string) => void;
}

export const useBufferManager = ({
  videoRef,
  streamUrl,
  movieId,
  chunkSize = 4 * 1024 * 1024, // 4MB default (optimized for better performance)
  maxCachedChunks = 10, // Limit cached chunks to prevent memory bloat
  onDebugLog
}: UseBufferManagerProps) => {
  const [isBuffering, setIsBuffering] = useState(false);
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

  const activeRequests = useRef(new Map<string, AbortController>());
  const completedRanges = useRef(new Set<string>());
  const bufferingTimeout = useRef<number>();
  const lastBufferingTime = useRef<number | null>(null);
  const chunkCache = useRef(new Map<string, { timestamp: number; size: number }>());

  const log = useCallback((message: string) => {
    const timestamp = new Date().toISOString().substr(11, 12);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    onDebugLog?.(logMessage);
  }, [onDebugLog]);

  // Memory management - clear old chunks with LRU strategy
  const cleanupOldChunks = useCallback(() => {
    if (chunkCache.current.size <= maxCachedChunks) return;

    const entries = Array.from(chunkCache.current.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);
    
    const toRemove = entries.slice(0, entries.length - maxCachedChunks);
    toRemove.forEach(([key]) => {
      chunkCache.current.delete(key);
      completedRanges.current.delete(key);
    });

    if (toRemove.length > 0) {
      log(`Cleaned up ${toRemove.length} old chunks from memory (LRU)`);
    }
  }, [maxCachedChunks, log]);

  const updateBufferInfo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const ranges: BufferRange[] = [];
    for (let i = 0; i < video.buffered.length; i++) {
      ranges.push({
        start: video.buffered.start(i),
        end: video.buffered.end(i)
      });
    }

    let loadedPercentage = 0;
    if (video.duration) {
      const totalBuffered = ranges.reduce((acc, range) => acc + (range.end - range.start), 0);
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
  }, [videoRef, isBuffering]);

  const isRangeLoaded = useCallback((start: number, end: number): boolean => {
    const rangeKey = `${start}-${end}`;
    return completedRanges.current.has(rangeKey);
  }, []);

  const fetchChunk = useCallback(async (start: number, end: number, isPreload = false) => {
    const rangeKey = `${start}-${end}`;
    
    if (activeRequests.current.has(rangeKey) || isRangeLoaded(start, end)) {
      return;
    }

    log(`Requesting chunk: ${rangeKey} ${isPreload ? "(preload)" : ""}`);
    
    const controller = new AbortController();
    activeRequests.current.set(rangeKey, controller);
    
    // Set shorter timeout for preload requests
    const timeoutMs = isPreload ? 15000 : 30000; // 15s for preload, 30s for regular
    const timeoutId = setTimeout(() => {
      controller.abort();
      log(`${isPreload ? 'Preload' : 'Chunk'} request timeout: ${rangeKey}`);
    }, timeoutMs);
    
    // Update request status
    setBufferInfo(prev => ({
      ...prev,
      requestStatus: new Map(prev.requestStatus).set(rangeKey, 'pending')
    }));

    try {
      const baseUrl = streamUrl.startsWith('/') ? streamUrl : `/${streamUrl}`;
      const separator = baseUrl.includes('?') ? '&' : '?';
      const queryParams = `range=${rangeKey}${isPreload ? '&preload=true' : ''}`;
      const fullUrl = `${baseUrl}${separator}${queryParams}`;

      const startTime = performance.now();
      const response = await fetch(fullUrl, {
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const fetchTime = Math.round(performance.now() - startTime);
        log(`Loaded chunk: ${rangeKey} in ${fetchTime}ms`);
        
        // Update cache and ranges
        completedRanges.current.add(rangeKey);
        chunkCache.current.set(rangeKey, { timestamp: Date.now(), size: chunkSize });
        
        cleanupOldChunks();
        
        setBufferInfo(prev => ({
          ...prev,
          requestStatus: new Map(prev.requestStatus).set(rangeKey, 'completed')
        }));
      } else {
        throw new Error(`HTTP error: ${response.status}`);
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      
      const errorMessage = error instanceof Error 
        ? (error.name === 'AbortError' ? `Request aborted: ${rangeKey}` : `Chunk error ${rangeKey}: ${error.message}`)
        : 'Unknown error';
      
      // For preload failures, log but don't treat as critical
      if (isPreload) {
        log(`Preload failed (non-critical): ${errorMessage}`);
        setBufferInfo(prev => ({
          ...prev,
          requestStatus: new Map(prev.requestStatus).set(rangeKey, 'skipped')
        }));
      } else {
        log(errorMessage);
        setBufferInfo(prev => ({
          ...prev,
          requestStatus: new Map(prev.requestStatus).set(rangeKey, 'failed'),
          lastError: errorMessage
        }));
      }
    } finally {
      activeRequests.current.delete(rangeKey);
    }
  }, [streamUrl, chunkSize, isRangeLoaded, log, cleanupOldChunks]);

  const tryResumePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    log(`Attempting to resume playback. ReadyState: ${video.readyState}`);
    
    try {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        await playPromise;
        log("Playback resumed successfully");
        setIsBuffering(false);
        
        if (lastBufferingTime.current !== null) {
          const bufferDuration = performance.now() - lastBufferingTime.current;
          setBufferInfo(prev => ({
            ...prev,
            bufferingDurations: [...prev.bufferingDurations, bufferDuration],
            totalBufferingTime: prev.totalBufferingTime + bufferDuration
          }));
          lastBufferingTime.current = null;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? `Playback resume failed: ${error.message}`
        : 'Unknown error during playback resume';
      log(errorMessage);
      setTimeout(tryResumePlayback, 1000);
    }
  }, [videoRef, log]);

  const handleWaiting = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    log(`Buffering at ${video.currentTime.toFixed(2)}s (ReadyState: ${video.readyState})`);
    setIsBuffering(true);
    
    // Track buffering start
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
    
    // Quick check for existing buffered data
    const hasBufferedData = Array.from({ length: video.buffered.length }, (_, i) => ({
      start: video.buffered.start(i),
      end: video.buffered.end(i)
    })).some(({ start, end }) => currentTime >= start && currentTime + 2 < end);
    
    if (hasBufferedData) {
      log('Data available, attempting resume');
      tryResumePlayback();
      return;
    }
    
    // Calculate and fetch needed chunk
    const kbps = (chunkSize / 8) * (video.duration ? (1 / video.duration) : 0.1);
    const startByte = Math.floor(currentTime * kbps);
    const endByte = startByte + chunkSize - 1;
    
    log(`Fetching chunk: ${startByte}-${endByte} for ${currentTime.toFixed(2)}s`);
    
    fetchChunk(startByte, endByte).then(() => {
      let retryCount = 0;
      const maxRetries = 10; // Prevent infinite buffering
      
      const checkAndResume = () => {
        const video = videoRef.current;
        if (!video) return;
        
        retryCount++;
        if (retryCount > maxRetries) {
          log(`Buffering timeout after ${maxRetries} retries, forcing resume`);
          tryResumePlayback();
          return;
        }
        
        updateBufferInfo();
        
        // Check if we can resume
        const canResume = video.readyState >= 3 || Array.from({ length: video.buffered.length }, (_, i) => ({
          start: video.buffered.start(i),
          end: video.buffered.end(i)
        })).some(({ start, end }) => video.currentTime >= start && video.currentTime + 2 < end);
        
        if (canResume) {
          log(`Resume ready (readyState: ${video.readyState})`);
          tryResumePlayback();
        } else {
          log(`Still buffering, retry ${retryCount}/${maxRetries}...`);
          bufferingTimeout.current = window.setTimeout(checkAndResume, 500);
        }
      };
      
      checkAndResume();
    }).catch((error) => {
      log(`Chunk fetch failed: ${error.message}, attempting resume anyway`);
      // If chunk fetch fails, try to resume with what we have
      setTimeout(tryResumePlayback, 1000);
    });
  }, [videoRef, chunkSize, log, fetchChunk, tryResumePlayback, updateBufferInfo]);

  const handlePlaying = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    log(`Resumed at ${video.currentTime.toFixed(2)}s`);
    
    if (bufferingTimeout.current) {
      window.clearTimeout(bufferingTimeout.current);
    }
    
    setIsBuffering(false);
    
    // Record buffering duration
    if (lastBufferingTime.current !== null) {
      const bufferDuration = performance.now() - lastBufferingTime.current;
      log(`Buffered for ${bufferDuration.toFixed(0)}ms`);
      
      setBufferInfo(prev => ({
        ...prev,
        bufferingDurations: [...prev.bufferingDurations, bufferDuration],
        totalBufferingTime: prev.totalBufferingTime + bufferDuration,
        bufferingStartTime: undefined
      }));
      
      lastBufferingTime.current = null;
    }
  }, [videoRef, log]);

  const handleProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const { buffered, currentTime, duration } = video;
    
    // More conservative preloading - only when buffer is very low and no active requests
    const activeRequestCount = activeRequests.current.size;
    
    // Don't preload if we already have too many active requests
    if (activeRequestCount > 2) {
      updateBufferInfo();
      return;
    }
    
    for (let i = 0; i < buffered.length; i++) {
      const bufferStart = buffered.start(i);
      const bufferEnd = buffered.end(i);

      // Only preload when buffer is very low (10s instead of 15s) and we're in the current range
      if (currentTime >= bufferStart && bufferEnd - currentTime < 10 && bufferEnd - currentTime > 5) {
        const kbps = (chunkSize / 8) * (duration ? (1 / duration) : 0.1);
        const startByte = Math.floor(bufferEnd * kbps);
        const endByte = startByte + chunkSize - 1;
        
        // Check if this range is already being requested or completed
        const rangeKey = `${startByte}-${endByte}`;
        if (!activeRequests.current.has(rangeKey) && !completedRanges.current.has(rangeKey)) {
          log(`Preloading from ${bufferEnd.toFixed(2)}s`);
          fetchChunk(startByte, endByte, true);
          break; // Only preload one chunk at a time
        }
      }
    }
    
    updateBufferInfo();
  }, [videoRef, chunkSize, log, fetchChunk, updateBufferInfo]);

  // Buffer reset functionality for stuck scenarios
  const resetBuffer = useCallback(() => {
    log('Resetting buffer state');
    
    // Cancel all active requests
    activeRequests.current.forEach(controller => controller.abort());
    activeRequests.current.clear();
    
    // Clear timeouts
    if (bufferingTimeout.current) {
      window.clearTimeout(bufferingTimeout.current);
    }
    
    // Clear cache and ranges
    completedRanges.current.clear();
    chunkCache.current.clear();
    
    // Reset state
    setIsBuffering(false);
    lastBufferingTime.current = null;
    
    setBufferInfo(prev => ({
      ...prev,
      requestStatus: new Map(),
      lastError: undefined,
      bufferingStartTime: undefined
    }));
    
    // Force video to re-evaluate its buffer
    const video = videoRef.current;
    if (video) {
      const currentTime = video.currentTime;
      video.currentTime = currentTime + 0.01;
      video.currentTime = currentTime;
    }
    
    log('Buffer reset complete');
  }, [videoRef, log]);

  const cleanup = useCallback(() => {
    if (bufferingTimeout.current) {
      window.clearTimeout(bufferingTimeout.current);
    }
    
    activeRequests.current.forEach(controller => controller.abort());
    activeRequests.current.clear();
    
    // Save position
    const video = videoRef.current;
    if (video && video.currentTime > 0) {
      localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
    }
    
    log('BufferManager cleanup complete');
  }, [videoRef, movieId, log]);

  return {
    isBuffering,
    bufferInfo,
    updateBufferInfo,
    handleWaiting,
    handlePlaying,
    handleProgress,
    resetBuffer,
    cleanup,
    fetchChunk
  };
};
