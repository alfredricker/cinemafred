'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Movie } from '@/types/movie';
import { Star, Clock, Play, ArrowLeft } from 'lucide-react';

interface TVMovieDetailProps {
  movie: Movie;
  onBack: () => void;
  onPlay: () => void;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TVMovieDetail({ movie, onBack, onPlay }: TVMovieDetailProps) {
  const onBackRef = useRef(onBack);
  const onPlayRef = useRef(onPlay);
  useEffect(() => { onBackRef.current = onBack; onPlayRef.current = onPlay; });

  // 0 = Play, 1 = Back
  const [focusedBtn, setFocusedBtn] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setFocusedBtn(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedBtn(0);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedBtn === 0) onPlayRef.current();
          else onBackRef.current();
          break;
        case 'Escape':
        case 'BrowserBack':
          e.preventDefault();
          onBackRef.current();
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusedBtn]);

  const imageUrl = movie.r2_image_path ? `/api/movie/${movie.r2_image_path}` : null;
  const rating = movie.averageRating ?? movie.rating;

  return (
    <div className="min-h-screen bg-black flex overflow-hidden">
      {/* Poster */}
      <div className="w-[42vw] relative flex-shrink-0">
        {imageUrl ? (
          <Image src={imageUrl} alt={movie.title} fill className="object-cover" priority />
        ) : (
          <div className="w-full h-full bg-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-40" />
      </div>

      {/* Info panel */}
      <div className="flex-1 flex flex-col justify-center px-16 py-16">
        <h1 className="text-6xl font-bold text-white mb-4 leading-tight">{movie.title}</h1>

        <div className="flex items-center gap-6 mb-6 text-xl">
          {movie.year && <span className="text-gray-400">{movie.year}</span>}
          {movie.duration && (
            <span className="flex items-center gap-2 text-gray-400">
              <Clock className="w-5 h-5" />
              {formatDuration(movie.duration)}
            </span>
          )}
          <span className="flex items-center gap-2 text-yellow-400 font-semibold">
            <Star className="w-5 h-5 fill-yellow-400" />
            {rating.toFixed(1)}
          </span>
        </div>

        {movie.genre?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {movie.genre.map(g => (
              <span key={g} className="px-4 py-1.5 bg-gray-800 text-gray-300 rounded-full text-base">
                {g}
              </span>
            ))}
          </div>
        )}

        {movie.description && (
          <p className="text-gray-300 text-lg leading-relaxed mb-10 max-w-2xl line-clamp-5">
            {movie.description}
          </p>
        )}

        <div className="flex items-center gap-5">
          <button
            onClick={onPlay}
            onMouseEnter={() => setFocusedBtn(0)}
            className={`flex items-center gap-4 px-12 py-5 text-2xl font-bold rounded-2xl transition-all outline-none ${
              focusedBtn === 0
                ? 'bg-white text-black scale-105 ring-4 ring-white ring-offset-4 ring-offset-black shadow-xl'
                : 'bg-gray-700 text-white'
            }`}
          >
            <Play className={`w-8 h-8 ${focusedBtn === 0 ? 'fill-black' : 'fill-white'}`} />
            Play
          </button>
          <button
            onClick={onBack}
            onMouseEnter={() => setFocusedBtn(1)}
            className={`flex items-center gap-3 px-8 py-5 text-2xl rounded-2xl transition-all outline-none ${
              focusedBtn === 1
                ? 'bg-white text-black scale-105 ring-4 ring-white ring-offset-4 ring-offset-black shadow-xl'
                : 'bg-gray-800 text-white'
            }`}
          >
            <ArrowLeft className="w-6 h-6" />
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
