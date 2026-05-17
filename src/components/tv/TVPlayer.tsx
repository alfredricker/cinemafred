'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { HLSManager } from '@/components/stream/HLSManager';
import { ArrowLeft, Play, Pause, Volume2, VolumeX } from 'lucide-react';

const FF_SPEEDS = [2, 4, 8, 16] as const;
// seconds stepped backwards every 250 ms — gives ~2x/4x/8x/16x effective rewind rate
const RW_STEPS = [0.5, 1, 2, 4] as const;
const RW_LABELS = ['2x', '4x', '8x', '16x'] as const;
const OSD_HIDE_DELAY = 3500;

interface TVPlayerProps {
  movieId: string;
  title: string;
  streamUrl: string;
  poster?: string;
  subtitlesUrl?: string | null;
  useHLS?: boolean;
  onBack: () => void;
}

function fmt(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function TVPlayer({ movieId, title, streamUrl, poster, subtitlesUrl, useHLS = true, onBack }: TVPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsManagerRef = useRef<HLSManager | null>(null);

  // Playback display state
  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // OSD
  const [showOSD, setShowOSD] = useState(true);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seek mode — stored in refs so the interval callback always sees current values
  const seekModeRef = useRef<'none' | 'ff' | 'rw'>('none');
  const seekSpeedRef = useRef(0);
  const seekIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [seekLabel, setSeekLabel] = useState<string | null>(null);

  // Stable ref to onBack so keyboard handler doesn't go stale
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; });

  const getAuthUrl = useCallback((isHLS = false) => {
    const token = localStorage.getItem('token');
    const base = isHLS ? `/api/hls/${movieId}` : streamUrl;
    if (!token) return base;
    return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }, [movieId, streamUrl]);

  const bumpOSD = useCallback(() => {
    setShowOSD(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => setShowOSD(false), OSD_HIDE_DELAY);
  }, []);

  const stopSeek = useCallback(() => {
    if (seekIntervalRef.current) { clearInterval(seekIntervalRef.current); seekIntervalRef.current = null; }
    const v = videoRef.current;
    if (v) {
      if (seekModeRef.current === 'ff') v.playbackRate = 1;
      else if (seekModeRef.current === 'rw') v.play();
    }
    seekModeRef.current = 'none';
    seekSpeedRef.current = 0;
    setSeekLabel(null);
  }, []);

  // Player init
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handlers: [string, EventListener][] = [
      ['pause', () => setIsPaused(true)],
      ['play', () => setIsPaused(false)],
      ['volumechange', () => setVolume(v.volume)],
      ['timeupdate', () => {
        setCurrentTime(v.currentTime);
        if (v.currentTime > 0) localStorage.setItem(`video-position-${movieId}`, String(v.currentTime));
      }],
      ['loadedmetadata', () => {
        setDuration(v.duration);
        const saved = parseFloat(localStorage.getItem(`video-position-${movieId}`) ?? '0');
        if (saved > 0 && saved < v.duration) v.currentTime = saved;
      }],
    ];

    handlers.forEach(([ev, fn]) => v.addEventListener(ev, fn));

    if (useHLS) {
      hlsManagerRef.current = new HLSManager({
        movieId, videoRef,
        onError: () => {},
        onStatsUpdate: () => {},
        onQualitiesUpdate: () => {},
        getAuthenticatedUrl: getAuthUrl,
      });
      if (!hlsManagerRef.current.initialize()) v.src = getAuthUrl(false);
    } else {
      v.src = getAuthUrl(false);
    }

    v.play().catch(() => {});
    bumpOSD();

    return () => {
      handlers.forEach(([ev, fn]) => v.removeEventListener(ev, fn));
      hlsManagerRef.current?.destroy();
      hlsManagerRef.current = null;
      if (seekIntervalRef.current) clearInterval(seekIntervalRef.current);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    };
  }, [movieId, streamUrl, useHLS, getAuthUrl, bumpOSD]);

  // Keyboard handler — registered once, reads seek state from refs
  useEffect(() => {
    const v = videoRef.current;

    const onKey = (e: KeyboardEvent) => {
      bumpOSD();
      if (!v) return;

      switch (e.key) {
        case 'Escape':
        case 'BrowserBack':
          e.preventDefault();
          stopSeek();
          localStorage.setItem(`video-position-${movieId}`, String(v.currentTime));
          onBackRef.current();
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (seekModeRef.current !== 'none') {
            stopSeek();
          } else {
            v.paused ? v.play() : v.pause();
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, Math.round((v.volume + 0.1) * 10) / 10);
          break;

        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, Math.round((v.volume - 0.1) * 10) / 10);
          break;

        case 'ArrowRight': {
          e.preventDefault();
          if (seekModeRef.current === 'rw') {
            if (seekIntervalRef.current) { clearInterval(seekIntervalRef.current); seekIntervalRef.current = null; }
            seekModeRef.current = 'ff';
            seekSpeedRef.current = 0;
          } else if (seekModeRef.current === 'ff') {
            seekSpeedRef.current = Math.min(seekSpeedRef.current + 1, FF_SPEEDS.length - 1);
          } else {
            seekModeRef.current = 'ff';
            seekSpeedRef.current = 0;
          }
          const ffSpeed = FF_SPEEDS[seekSpeedRef.current];
          v.playbackRate = ffSpeed;
          if (v.paused) v.play();
          setSeekLabel(`⏩ ${ffSpeed}x`);
          break;
        }

        case 'ArrowLeft': {
          e.preventDefault();
          if (seekModeRef.current === 'ff') {
            v.playbackRate = 1;
            v.pause();
            seekModeRef.current = 'rw';
            seekSpeedRef.current = 0;
          } else if (seekModeRef.current === 'rw') {
            seekSpeedRef.current = Math.min(seekSpeedRef.current + 1, RW_STEPS.length - 1);
            if (seekIntervalRef.current) { clearInterval(seekIntervalRef.current); seekIntervalRef.current = null; }
          } else {
            v.pause();
            seekModeRef.current = 'rw';
            seekSpeedRef.current = 0;
          }
          const step = RW_STEPS[seekSpeedRef.current];
          setSeekLabel(`⏪ ${RW_LABELS[seekSpeedRef.current]}`);
          seekIntervalRef.current = setInterval(() => {
            const vid = videoRef.current;
            if (!vid) return;
            const next = vid.currentTime - step;
            if (next <= 0) { vid.currentTime = 0; stopSeek(); }
            else vid.currentTime = next;
          }, 250);
          break;
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [movieId, bumpOSD, stopSeek]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        poster={poster}
        preload="auto"
        crossOrigin="anonymous"
      >
        {subtitlesUrl && (
          <track kind="subtitles" src={subtitlesUrl} srcLang="en" label="English" />
        )}
      </video>

      {/* Seek mode badge — always visible while seeking */}
      {seekLabel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-black/80 text-white text-6xl font-bold px-14 py-7 rounded-3xl backdrop-blur-sm">
            {seekLabel}
          </div>
        </div>
      )}

      {/* OSD overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between z-10 pointer-events-none transition-opacity duration-500 ${
          showOSD ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar */}
        <div className="bg-gradient-to-b from-black/80 to-transparent px-14 pt-10 pb-20">
          <div className="flex items-center gap-5">
            <button
              onClick={onBack}
              className="pointer-events-auto p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-8 h-8 text-white" />
            </button>
            <span className="text-white text-3xl font-semibold drop-shadow-lg">{title}</span>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-gradient-to-t from-black/90 to-transparent px-14 pb-10 pt-20">
          {/* Progress bar */}
          <div className="relative h-1.5 bg-white/25 rounded-full mb-5 cursor-pointer">
            <div className="absolute left-0 top-0 h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {isPaused
                ? <Play className="w-8 h-8 text-white fill-white" />
                : <Pause className="w-8 h-8 text-white fill-white" />
              }
              <span className="text-white text-2xl font-mono tabular-nums">
                {fmt(currentTime)} / {fmt(duration)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {volume === 0
                ? <VolumeX className="w-7 h-7 text-white" />
                : <Volume2 className="w-7 h-7 text-white" />
              }
              <div className="w-28 h-1.5 bg-white/25 rounded-full">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${volume * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
