'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { HLSManager } from '@/components/stream/HLSManager';
import { ArrowLeft, Play, Pause, Subtitles, Check } from 'lucide-react';
import { useSubtitles } from '@/hooks/useSubtitles';

type NavItem = 'back' | 'pause' | 'subtitles';

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

// Step size grows the longer a seek session has been held: 10s → 30s → 60s
function seekStep(sessionStart: number): number {
  const held = Date.now() - sessionStart;
  if (held > 3000) return 60;
  if (held > 1000) return 30;
  return 10;
}

export function TVPlayer({ movieId, title, movieYear = 0, streamUrl, poster, subtitlesUrl, useHLS = true, onBack }: TVPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsManagerRef = useRef<HLSManager | null>(null);

  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Seek overlay: shown when left/right is pressed in watch mode
  const [seekDir, setSeekDir] = useState<'fwd' | 'rwd' | null>(null);
  const seekHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekSessionStartRef = useRef(0);
  const lastSeekFireRef = useRef(0);
  const isSeekingRef = useRef(false); // prevents pause event from triggering navMode

  // Subtitle panel
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(false);
  const [subtitleFocusIdx, setSubtitleFocusIdx] = useState(0);
  const subtitleItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [navMode, setNavMode] = useState(false);
  const [navFocus, setNavFocus] = useState<NavItem>('pause');

  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; });

  const { options: subtitleOptions, loading: subtitlesLoading, activeId: activeSubtitleId, activeUrl: activeSubtitleUrl, selectSubtitle } = useSubtitles(title, movieYear, movieId, subtitlesUrl);

  const subtitlesAvailable = subtitleOptions.length > 0 || subtitlesLoading;
  const navItems: NavItem[] = subtitlesAvailable ? ['back', 'pause', 'subtitles'] : ['back', 'pause'];

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
    const base = isHLS ? `/api/hls/${movieId}` : `/api/stream/${movieId}`;
    if (!token) return base;
    return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }, [movieId]);

  const clearSeekOverlay = useCallback((resume = false) => {
    if (seekHideTimerRef.current) { clearTimeout(seekHideTimerRef.current); seekHideTimerRef.current = null; }
    isSeekingRef.current = false;
    setSeekDir(null);
    if (resume && videoRef.current?.paused) videoRef.current.play();
  }, []);

  const exitToLibrary = useCallback(() => {
    const v = videoRef.current;
    clearSeekOverlay();
    if (v) localStorage.setItem(`video-position-${movieId}`, String(v.currentTime));
    onBackRef.current();
  }, [movieId, clearSeekOverlay]);

  const openSubtitlePanel = useCallback(() => {
    if (subtitleItems.length <= 1 && !subtitlesLoading) return;
    const currentIdx = subtitleItems.findIndex(it => it.id === activeSubtitleId);
    setSubtitleFocusIdx(currentIdx >= 0 ? currentIdx : 0);
    setShowSubtitlePanel(true);
  }, [subtitleItems, subtitlesLoading, activeSubtitleId]);

  // Player init
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handlers: [string, EventListener][] = [
      ['pause', () => { setIsPaused(true); if (!isSeekingRef.current) { setNavMode(true); setNavFocus('pause'); } }],
      ['play', () => { setIsPaused(false); setNavMode(false); }],
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

    return () => {
      handlers.forEach(([ev, fn]) => v.removeEventListener(ev, fn));
      hlsManagerRef.current?.destroy();
      hlsManagerRef.current = null;
      if (seekHideTimerRef.current) clearTimeout(seekHideTimerRef.current);
    };
  }, [movieId, streamUrl, useHLS, getAuthUrl]);

  // If subtitles become unavailable while focused on them, snap back to 'pause'
  useEffect(() => {
    if (!subtitlesAvailable && navFocus === 'subtitles') setNavFocus('pause');
  }, [subtitlesAvailable, navFocus]);

  // Keyboard handler
  useEffect(() => {
    const v = videoRef.current;

    const onKey = (e: KeyboardEvent) => {
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
        return;
      }

      if (!v) return;

      // --- Nav mode (OSD visible, horizontal button focus) ---
      if (navMode) {
        switch (e.key) {
          case 'ArrowLeft': {
            e.preventDefault();
            const idx = navItems.indexOf(navFocus);
            if (idx > 0) setNavFocus(navItems[idx - 1]);
            return;
          }
          case 'ArrowRight': {
            e.preventDefault();
            const idx = navItems.indexOf(navFocus);
            if (idx >= 0 && idx < navItems.length - 1) setNavFocus(navItems[idx + 1]);
            return;
          }
          case 'Enter':
          case ' ':
            e.preventDefault();
            if (navFocus === 'back') {
              exitToLibrary();
            } else if (navFocus === 'pause') {
              v.paused ? v.play() : v.pause();
            } else if (navFocus === 'subtitles') {
              openSubtitlePanel();
            }
            return;
          case 'ArrowUp':
          case 'Escape':
          case 'BrowserBack':
            e.preventDefault();
            setNavMode(false);
            return;
          case 'ArrowDown':
            e.preventDefault();
            return;
        }
        return;
      }

      // --- Watch mode ---
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setNavFocus('pause');
          setNavMode(true);
          break;

        case 'Escape':
        case 'BrowserBack':
          e.preventDefault();
          exitToLibrary();
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (seekDir !== null) { clearSeekOverlay(true); break; }
          v.paused ? v.play() : v.pause();
          break;

        case 'ArrowRight': {
          e.preventDefault();
          const nowFwd = Date.now();
          if (!e.repeat) {
            seekSessionStartRef.current = nowFwd;
            lastSeekFireRef.current = 0;
          } else if (nowFwd - lastSeekFireRef.current < 200) {
            break;
          }
          lastSeekFireRef.current = nowFwd;
          isSeekingRef.current = true;
          if (!v.paused) v.pause();
          v.currentTime = v.duration > 0
            ? Math.min(v.duration, v.currentTime + seekStep(seekSessionStartRef.current))
            : v.currentTime + seekStep(seekSessionStartRef.current);
          setSeekDir('fwd');
          if (seekHideTimerRef.current) clearTimeout(seekHideTimerRef.current);
          seekHideTimerRef.current = setTimeout(() => { isSeekingRef.current = false; setSeekDir(null); videoRef.current?.play(); }, 2000);
          break;
        }

        case 'ArrowLeft': {
          e.preventDefault();
          const nowRwd = Date.now();
          if (!e.repeat) {
            seekSessionStartRef.current = nowRwd;
            lastSeekFireRef.current = 0;
          } else if (nowRwd - lastSeekFireRef.current < 200) {
            break;
          }
          lastSeekFireRef.current = nowRwd;
          isSeekingRef.current = true;
          if (!v.paused) v.pause();
          v.currentTime = Math.max(0, v.currentTime - seekStep(seekSessionStartRef.current));
          setSeekDir('rwd');
          if (seekHideTimerRef.current) clearTimeout(seekHideTimerRef.current);
          seekHideTimerRef.current = setTimeout(() => { isSeekingRef.current = false; setSeekDir(null); videoRef.current?.play(); }, 2000);
          break;
        }

        case 's':
        case 'S':
          e.preventDefault();
          openSubtitlePanel();
          break;
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navMode, navFocus, navItems, showSubtitlePanel, subtitleItems, subtitleFocusIdx, selectSubtitle, exitToLibrary, openSubtitlePanel]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const focusRing = (item: NavItem) =>
    navMode && navFocus === item ? 'ring-4 ring-white scale-110' : '';

  return (
    <div className="tv-player fixed inset-0 bg-black overflow-hidden">
      <video
        ref={videoRef}
        className="tv-player-video absolute object-contain"
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

      {/* Seek overlay — bottom bar shown when seeking in watch mode */}
      {seekDir !== null && !navMode && (
        <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none bg-gradient-to-t from-black/85 to-transparent px-14 pb-10 pt-24">
          <div className="relative h-2 bg-white/25 rounded-full mb-5 overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-white rounded-full transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white/70 text-3xl select-none">
              {seekDir === 'fwd' ? '▶▶' : '◀◀'}
            </span>
            <span className="text-white text-3xl font-mono tabular-nums">{fmt(currentTime)}</span>
            <span className="text-white/40 text-2xl font-mono tabular-nums">/ {fmt(duration)}</span>
          </div>
        </div>
      )}

      {/* Nav OSD — top and bottom bars shown when paused or ArrowDown pressed */}
      <div
        className={`absolute inset-0 flex flex-col justify-between z-10 pointer-events-none transition-opacity duration-300 ${
          navMode ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar — back, title, play/pause, subtitles */}
        <div className="bg-gradient-to-b from-black/80 to-transparent px-14 pt-10 pb-20">
          <div className="flex items-center gap-5">
            <button
              onClick={exitToLibrary}
              className={`pointer-events-auto p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all ${focusRing('back')}`}
            >
              <ArrowLeft className="w-8 h-8 text-white" />
            </button>
            <span className="text-white text-3xl font-semibold drop-shadow-lg truncate">{title}</span>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => {
                  const v = videoRef.current;
                  if (v) v.paused ? v.play() : v.pause();
                }}
                className={`pointer-events-auto p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all ${focusRing('pause')}`}
              >
                {isPaused
                  ? <Play className="w-7 h-7 text-white fill-white" />
                  : <Pause className="w-7 h-7 text-white fill-white" />}
              </button>

              {subtitlesAvailable && (
                <button
                  onClick={openSubtitlePanel}
                  className={`pointer-events-auto p-3 rounded-full transition-all ${focusRing('subtitles')} ${
                    activeSubtitleId ? 'bg-blue-600/70 hover:bg-blue-700/70' : 'bg-white/10 hover:bg-white/20'
                  }`}
                  title="Subtitles (S)"
                >
                  <Subtitles className="w-7 h-7 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar — progress + time */}
        <div className="bg-gradient-to-t from-black/90 to-transparent px-14 pb-10 pt-20">
          <div className="relative h-1.5 bg-white/25 rounded-full mb-5">
            <div className="absolute left-0 top-0 h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-white text-2xl font-mono tabular-nums">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
