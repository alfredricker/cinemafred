import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Subtitles } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface VideoPlayerProps {
  streamUrl: string;
  poster?: string;
  title: string;
  movieId: string;
  subtitlesUrl?: string | null;
  isAdmin?: boolean;
  onClose?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  streamUrl, 
  poster, 
  title,
  movieId,
  subtitlesUrl,
  isAdmin = false,
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();
  const [captionsOn, setCaptionsOn] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // Simple video event handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.currentTime > 0) {
      localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
    }
  };

  const handleLoadStart = () => {
    setVideoError(null);
  };

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video || retryCount >= maxRetries) {
      setVideoError('Failed to load video after multiple attempts');
      return;
    }
    
    console.log(`Retrying video load (attempt ${retryCount + 1}/${maxRetries})`);
    setRetryCount(prev => prev + 1);
    
    const currentTime = video.currentTime;
    
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
      console.log(`Video error: ${errorCode} - ${errorMessage}`);
      
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
        console.log('Network error - will retry in 2 seconds');
        setTimeout(retryVideo, 2000);
      }
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    
    console.log(`Metadata loaded. Duration: ${video.duration.toFixed(2)}s`);
    
    // Clear any previous errors on successful load
    setVideoError(null);
    setRetryCount(0);
    
    // Validate video source
    if (!video.duration || video.duration === Infinity || isNaN(video.duration)) {
      console.log('Invalid video duration detected - source may be corrupted');
      setVideoError('Invalid video source - duration could not be determined');
      return;
    }
    
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

  // Create authenticated stream URL
  const getAuthenticatedStreamUrl = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No authentication token found');
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
      console.log(`Updated video source with auth token`);
    }

    // Event listeners for native browser buffering
    const events = [
      ['loadstart', handleLoadStart],
      ['timeupdate', handleTimeUpdate],
      ['error', handleError],
      ['loadedmetadata', handleLoadedMetadata]
    ] as const;

    // Add all event listeners
    events.forEach(([event, handler]) => video.addEventListener(event, handler));

    console.log(`Player initialized: ${movieId}`);
    console.log(`Stream: ${streamUrl}`);
    subtitlesUrl && console.log('Subtitles available');

    return () => {
      // Remove all event listeners
      events.forEach(([event, handler]) => video.removeEventListener(event, handler));
      console.log('Player unmounted');
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

    // Use onClose if provided, otherwise fallback to navigation
    if (onClose) {
      onClose();
    } else {
      window.location.href = `/movie/${movieId}`;
    }
  };
  
  // Format time in MM:SS format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col">{/* Simplified video player with native buffering */}

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
      </div>

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

        {/* Native browser loading indicator is used instead of custom overlay */}

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
            </div>
          </div>
        )}
      </div>

    </div>
  );
};