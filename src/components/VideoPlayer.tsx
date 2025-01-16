import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Subtitles, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface VideoPlayerProps {
  streamUrl: string;
  poster?: string;
  title: string;
  movieId: string;
  subtitlesUrl?: string | null;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  streamUrl, 
  poster, 
  title,
  movieId,
  subtitlesUrl 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const bufferingTimeout = useRef<number>();
  const activeRequests = useRef(new Map<string, AbortController>());
  const completedRanges = useRef(new Set<string>());
  const router = useRouter();
  const [captionsOn, setCaptionsOn] = useState(false);
  const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB chunks

  const isRangeLoaded = (start: number, end: number) => {
    for (const range of completedRanges.current) {
      const [loadedStart, loadedEnd] = range.split('-').map(Number);
      if (start <= loadedEnd && end >= loadedStart) {
        console.log(`Range ${start}-${end} already loaded in ${loadedStart}-${loadedEnd}`);
        return true;
      }
    }
    return false;
  };

  const fetchChunk = async (start: number, end: number, isPreload = false) => {
    const rangeKey = `${start}-${end}`;
    
    if (activeRequests.current.has(rangeKey)) {
      console.log(`Request for ${rangeKey} already in progress`);
      return;
    }
  
    if (isRangeLoaded(start, end)) {
      console.log(`Range ${rangeKey} already loaded`);
      return;
    }
  
    console.log(`Requesting chunk: ${rangeKey} ${isPreload ? "(preload)" : ""}`);
    
    const controller = new AbortController();
    activeRequests.current.set(rangeKey, controller);
  
    try {
      const url = new URL(streamUrl);
      if (isPreload) url.searchParams.set('preload', 'true');
  
      const response = await fetch(`${url.toString()}?range=${rangeKey}`, {
        signal: controller.signal,
      });
  
      if (response.ok) {
        console.log(`Successfully loaded chunk: ${rangeKey}`);
        completedRanges.current.add(rangeKey);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log(`Request for ${rangeKey} aborted`);
        } else {
          console.error(`Error loading chunk ${rangeKey}:`, error.message);
        }
      }
    } finally {
      activeRequests.current.delete(rangeKey);
    }
  };

  const tryResumePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
  
    try {
      await video.play();
      setIsBuffering(false);
      console.log("Playback resumed successfully");
    } catch (error) {
      console.warn("Playback resume attempt failed, retrying...");
      setTimeout(tryResumePlayback, 1000); // Retry after delay
    }
  };
  

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const savedPosition = localStorage.getItem(`video-position-${movieId}`);
    if (savedPosition) {
      video.currentTime = parseFloat(savedPosition);
    }

    const handleWaiting = () => {
      console.log("Video waiting for data");
      setIsBuffering(true);
    
      const video = videoRef.current;
      if (!video) return;
    
      const currentTime = video.currentTime;
      const startByte = Math.floor(currentTime * CHUNK_SIZE);
      const endByte = startByte + CHUNK_SIZE - 1;
    
      // First fetch the needed chunk
      fetchChunk(startByte, endByte).then(() => {
        // After fetching, start checking buffer status periodically
        const checkBufferAndResume = async () => {
          const video = videoRef.current;
          
          if (video && video.readyState >= 3) {
            console.log('Buffered enough to resume playback');
            setIsBuffering(false);
            if (video.paused) {
              console.log('Resuming playback');
              await video.play().catch((error) => {
                console.error('Error resuming playback:', error);
                // If playback fails, retry after a short delay
                setTimeout(checkBufferAndResume, 500);
              });
            }
          } else {
            console.log('Still buffering, retrying...');
            bufferingTimeout.current = window.setTimeout(checkBufferAndResume, 500);
          }
        };
    
        checkBufferAndResume();
      });
    };

    const handlePlaying = () => {
      console.log('Video resumed playing');
      if (bufferingTimeout.current) {
        window.clearTimeout(bufferingTimeout.current);
      }
      setIsBuffering(false);
    };

    const handleProgress = () => {
      const video = videoRef.current;
      if (!video) return;
    
      const buffered = video.buffered;
      const currentTime = video.currentTime;
    
      for (let i = 0; i < buffered.length; i++) {
        const bufferStart = buffered.start(i);
        const bufferEnd = buffered.end(i);
    
        // Fetch next chunk if we have less than 15 seconds of buffer remaining
        if (currentTime >= bufferStart && bufferEnd - currentTime < 30) {
          const startByte = Math.floor(bufferEnd * CHUNK_SIZE);
          const endByte = startByte + CHUNK_SIZE - 1;
          fetchChunk(startByte, endByte);
        }
      }
    };

    const handleTimeUpdate = () => {
      if (video.currentTime > 0) {
        localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
      }
    };

    video.addEventListener('waiting', handleWaiting); //trying out the handleBuffering function instead of handleWaiting
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      if (bufferingTimeout.current) {
        window.clearTimeout(bufferingTimeout.current);
      }

      activeRequests.current.forEach(controller => controller.abort());
      activeRequests.current.clear();
      
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      
      if (video.currentTime > 0) {
        localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
      }
    };
  }, [movieId, streamUrl]);

// in VideoPlayer.tsx
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

  return (
    <div className="relative w-full">
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
};