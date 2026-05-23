'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { HLSManager } from '@/components/stream/HLSManager';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Subtitles, Check } from 'lucide-react';
import { useSubtitles } from '@/hooks/useSubtitles';
import type { SubtitleOption } from '@/hooks/useSubtitles';

const FF_SPEEDS = [2, 4, 8, 16] as const;
const RW_STEPS = [0.5, 1, 2, 4] as const;
const RW_LABELS = ['2x', '4x', '8x', '16x'] as const;
const OSD_HIDE_DELAY = 3500;

interface TVPlayerProps {
  movieId: string;
  title: string;
  movieYear?: number;
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
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ru: 'Russian',
};
function langName(code: string) { return LANG_NAMES[code] ?? code.toUpperCase(); }

export function TVPlayer({ movieId, title, movieYear = 0, streamUrl, poster, subtitlesUrl, useHLS = true, onBack }: TVPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsManagerRef = useRef<HLSManager | null>(null);

  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const [showOSD, setShowOSD] = useState(true);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seekModeRef = useRef<'none' | 'ff' | 'rw'>('none');
  const seekSpeedRef = useRef(0);
  const seekIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [seekLabel, setSeekLabel] = useState<string | null>(null);

  // Subtitle panel
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(false);
  const [subtitleFocusIdx, setSubtitleFocusIdx] = useState(0);
  const subtitleItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Paused settings focus (remote navigation). Extend the union to add more settings rows.
  type PausedFocus = 'none' | 'subtitles';
  const [pausedFocus, setPausedFocus] = useState<PausedFocus>('none');

  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; });

  const { options: subtitleOptions, loading: subtitlesLoading, activeId: activeSubtitleId, activeUrl: activeSubtitleUrl, selectSubtitle } = useSubtitles(title, movieYear, movieId, subtitlesUrl);

  // Panel items: "Off" + all options
  const subtitleItems: Array<{ id: string | null; label: string; lang?: string }> = [
    { id: null, label: 'Off' },
    ...subtitleOptions.map(o => ({
      id: o.id,
      label: o.source === 'local' ? langName(o.language) : o.label,
      lang: o.source === 'opensubtitles' ? langName(o.language) : undefined,
    })),
  ];

  // Manage track mode when active subtitle changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!activeSubtitleUrl) {
      Array.from(video.textTracks).forEach(t => (t.mode = 'hidden'));
      return;
    }
    const timer = setTimeout(() => {
      const track = video.textTracks[0];
      if (track) track.mode = 'showing';
    }, 150);
    return () => clearTimeout(timer);
  }, [activeSubtitleUrl]);

  // Scroll focused subtitle item into view
  useEffect(() => {
    subtitleItemRefs.current[subtitleFocusIdx]?.scrollIntoView({ block: 'nearest' });
  }, [subtitleFocusIdx]);

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
      ['play', () => { setIsPaused(false); setPausedFocus('none'); }],
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

  // Keyboard handler
  useEffect(() => {
    const v = videoRef.current;

    const onKey = (e: KeyboardEvent) => {
      bumpOSD();

      // --- Subtitle panel navigation ---
      if (showSubtitlePanel) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            setSubtitleFocusIdx(i => Math.max(0, i - 1));
            return;
          case 'ArrowDown':
            e.preventDefault();
            setSubtitleFocusIdx(i => Math.min(subtitleItems.length - 1, i + 1));
            return;
          case 'Enter':
          case ' ':
            e.preventDefault();
            selectSubtitle(subtitleItems[subtitleFocusIdx]?.id ?? null);
            setShowSubtitlePanel(false);
            return;
          case 'Escape':
          case 'BrowserBack':
            e.preventDefault();
            setShowSubtitlePanel(false);
            return;
        }
        return; // swallow all other keys while panel is open
      }

      if (!v) return;

      switch (e.key) {
        case 's':
        case 'S': {
          e.preventDefault();
          if (subtitleItems.length <= 1 && !subtitlesLoading) return;
          const currentIdx = subtitleItems.findIndex(it => it.id === activeSubtitleId);
          setSubtitleFocusIdx(currentIdx >= 0 ? currentIdx : 0);
          setShowSubtitlePanel(true);
          break;
        }

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
          if (seekModeRef.current !== 'none') { stopSeek(); break; }
          if (v.paused && pausedFocus === 'subtitles') {
            if (subtitleItems.length <= 1 && !subtitlesLoading) break;
            const currentIdx = subtitleItems.findIndex(it => it.id === activeSubtitleId);
            setSubtitleFocusIdx(currentIdx >= 0 ? currentIdx : 0);
            setShowSubtitlePanel(true);
            break;
          }
          if (v.paused) { setPausedFocus('none'); v.play(); }
          else v.pause();
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (v.paused) {
            setPausedFocus('none');
          } else {
            v.volume = Math.min(1, Math.round((v.volume + 0.1) * 10) / 10);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (v.paused) {
            if (subtitleOptions.length > 0 || subtitlesLoading) setPausedFocus('subtitles');
          } else {
            v.volume = Math.max(0, Math.round((v.volume - 0.1) * 10) / 10);
          }
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
  }, [movieId, bumpOSD, stopSeek, showSubtitlePanel, subtitleItems, subtitleFocusIdx, activeSubtitleId, subtitlesLoading, selectSubtitle, pausedFocus, subtitleOptions.length]);

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
        {activeSubtitleUrl && (
          <track
            key={activeSubtitleUrl}
            kind="subtitles"
            src={activeSubtitleUrl}
            srcLang="en"
            label="English"
          />
        )}
      </video>

      {/* Seek badge */}
      {seekLabel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-black/80 text-white text-6xl font-bold px-14 py-7 rounded-3xl backdrop-blur-sm">
            {seekLabel}
          </div>
        </div>
      )}

      {/* Subtitle panel */}
      {showSubtitlePanel && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="pointer-events-auto bg-black/90 backdrop-blur-sm border border-white/15 rounded-2xl shadow-2xl w-96 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
              <Subtitles className="w-5 h-5 text-white/70" />
              <span className="text-white text-xl font-semibold">Subtitles</span>
              {subtitlesLoading && (
                <span className="ml-auto text-sm text-white/40">Loading…</span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto py-2">
              {subtitleItems.map((item, idx) => (
                <button
                  key={item.id ?? '__off__'}
                  ref={el => { subtitleItemRefs.current[idx] = el; }}
                  onClick={() => { selectSubtitle(item.id ?? null); setShowSubtitlePanel(false); }}
                  className={`w-full flex items-center gap-4 px-6 py-3.5 text-left transition-colors ${
                    idx === subtitleFocusIdx
                      ? 'bg-white/15'
                      : 'hover:bg-white/8'
                  }`}
                >
                  <Check
                    className={`w-5 h-5 flex-shrink-0 ${
                      activeSubtitleId === item.id ? 'text-blue-400 opacity-100' : 'opacity-0'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className={`text-lg font-medium truncate ${idx === subtitleFocusIdx ? 'text-white' : 'text-white/70'}`}>
                      {item.label}
                    </div>
                    {item.lang && (
                      <div className="text-sm text-white/40">{item.lang}</div>
                    )}
                  </div>
                </button>
              ))}

              {!subtitlesLoading && subtitleItems.length <= 1 && (
                <p className="px-6 py-4 text-white/40 text-center">No subtitles available</p>
              )}
            </div>

            <div className="px-6 py-3 border-t border-white/10 text-sm text-white/30 text-center">
              ↑↓ navigate · Enter select · Esc close
            </div>
          </div>
        </div>
      )}

      {/* OSD */}
      <div
        className={`absolute inset-0 flex flex-col justify-between z-10 pointer-events-none transition-opacity duration-500 ${
          showOSD || pausedFocus !== 'none' ? 'opacity-100' : 'opacity-0'
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

            {/* Subtitle indicator */}
            {(subtitleOptions.length > 0 || subtitlesLoading) && (
              <button
                onClick={() => {
                  const currentIdx = subtitleItems.findIndex(it => it.id === activeSubtitleId);
                  setSubtitleFocusIdx(currentIdx >= 0 ? currentIdx : 0);
                  setShowSubtitlePanel(true);
                }}
                className={`pointer-events-auto ml-auto p-3 rounded-full transition-all ${
                  pausedFocus === 'subtitles' ? 'ring-4 ring-white scale-110' : ''
                } ${
                  activeSubtitleId ? 'bg-blue-600/70 hover:bg-blue-700/70' : 'bg-white/10 hover:bg-white/20'
                }`}
                title="Subtitles (S)"
              >
                <Subtitles className="w-7 h-7 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-gradient-to-t from-black/90 to-transparent px-14 pb-10 pt-20">
          <div className="relative h-1.5 bg-white/25 rounded-full mb-5">
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
