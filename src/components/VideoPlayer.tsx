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
  const [tracksLoaded, setTracksLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTrackLoad = () => {
      const tracks = video.textTracks;
      if (tracks.length > 0) {
        setTracksLoaded(true);
        // Initially set tracks based on captionsOn state
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].mode = captionsOn ? 'showing' : 'hidden';
        }
      }
    };

    // Set up track loading event listener
    video.addEventListener('loadedmetadata', handleTrackLoad);

    // Remove download button from controls
    video.setAttribute('controlsList', 'nodownload');

    return () => {
      video.removeEventListener('loadedmetadata', handleTrackLoad);
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'disabled';
      }
    };
  }, [captionsOn]);

  // Effect to handle caption toggle after tracks are loaded
  useEffect(() => {
    const video = videoRef.current;
    if (video && tracksLoaded) {
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = captionsOn ? 'showing' : 'hidden';
      }
    }
  }, [captionsOn, tracksLoaded]);

  const handleBack = () => {
    router.push(`/movie/${movieId}`);
  };

  const toggleCaptions = () => {
    setCaptionsOn(prev => !prev);
  };

  return (
    <div className="relative w-full">
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