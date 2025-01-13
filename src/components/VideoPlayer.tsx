import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Subtitles } from 'lucide-react';
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
  const router = useRouter();
  const [captionsOn, setCaptionsOn] = useState(false);

  // Load saved position and handle subtitles when component mounts
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const savedPosition = localStorage.getItem(`video-position-${movieId}`);
      if (savedPosition) {
        video.currentTime = parseFloat(savedPosition);
      }

      // Remove download button from controls
      video.setAttribute('controlsList', 'nodownload');
      
      // Save position periodically
      const saveInterval = setInterval(() => {
        if (video.currentTime > 0) {
          localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
        }
      }, 5000); // Save every 5 seconds

      // Save position on pause
      const handlePause = () => {
        localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
      };

      video.addEventListener('pause', handlePause);

      // Add the duration metadata handler
      const handleLoadedMetadata = () => {
        if (video && video.duration) {
          fetch(`/api/movies/${movieId}/update-duration`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ duration: Math.floor(video.duration) })
          }).catch(console.error);
        }

        // Initialize subtitle tracks
        const tracks = video.textTracks;
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].mode = captionsOn ? 'showing' : 'hidden';
        }
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);

      // Cleanup
      return () => {
        clearInterval(saveInterval);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        if (video.currentTime > 0) {
          localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
        }
      };
    }
  }, [movieId, captionsOn]);

  // Effect to handle caption toggle
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = captionsOn ? 'showing' : 'hidden';
      }
    }
  }, [captionsOn]);

  const handleBack = () => {
    window.location.href = `/movie/${movieId}`;
  };

  const toggleCaptions = () => {
    setCaptionsOn(prev => !prev);
  };

  return (
    <div className="relative w-full">
      <style jsx global>{`
        /* Hide the native captions menu button */
        video::-webkit-media-text-track-container {
          transform: translateY(-40px);
        }
        
        video::-webkit-media-text-track-display-backdrop {
          background-color: rgba(0, 0, 0, 0.6) !important;
        }
        
        video::-internal-media-controls-overflow-button {
          display: none !important;
        }

        @supports (-moz-appearance: none) {
          .media-controls-container .closed-caption-button {
            display: none !important;
          }
        }
      `}</style>

      <div className="absolute top-4 left-4 z-10 flex gap-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 
                   text-white rounded-lg transition-colors backdrop-blur-sm"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Details</span>
        </button>

        {subtitlesUrl && (
          <button
            onClick={toggleCaptions}
            className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 
                     text-white rounded-lg transition-colors backdrop-blur-sm"
          >
            <Subtitles className="w-5 h-5" />
            <span>{captionsOn ? "On" : "Off"}</span>
          </button>
        )}
      </div>

      <video
        ref={videoRef}
        className="w-full aspect-video rounded-lg bg-gray-900"
        controls
        poster={poster}
        preload="metadata"
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
            default
          />
        )}
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;