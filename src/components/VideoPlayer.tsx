import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
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

  // Load saved position when component mounts
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

      // Handle subtitle setup
      video.addEventListener('loadedmetadata', () => {
        const tracks = video.textTracks;
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          track.mode = 'showing';
        }
      });

      // Cleanup
      return () => {
        clearInterval(saveInterval);
        video.removeEventListener('pause', handlePause);
        // Save position one final time when component unmounts
        if (video.currentTime > 0) {
          localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
        }
      };
    }
  }, [movieId]);

  const handleBack = () => {
    // Force a hard navigation to ensure proper routing
    window.location.href = `/movie/${movieId}`;
  };

  return (
    <div className="relative w-full">
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 
                   text-white rounded-lg transition-colors backdrop-blur-sm"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Details</span>
        </button>
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