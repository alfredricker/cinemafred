'use client';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft, Play, Pause, Volume2, Volume1, VolumeX,
  Subtitles, Settings, Maximize2, Minimize2,
} from 'lucide-react';
import type { SubtitleOption } from '@/hooks/useSubtitles';
import { SubtitleSelector } from './SubtitleSelector';
import { QualitySelector } from './QualitySelector';

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export interface VideoControlBarProps {
  show: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isFullscreen: boolean;
  subtitleOptions: SubtitleOption[];
  activeSubtitleId: string | null;
  subtitlesLoading: boolean;
  onSubtitleChange: (id: string | null) => void;
  onSubtitleSearch: () => void;
  onSubtitleShift?: (offsetMs: number) => Promise<void>;
  onSubtitleStretch?: (percent: number) => Promise<void>;
  isAdmin?: boolean;
  isHLSSupported: boolean;
  availableQualities: string[];
  currentQuality: string;
  onBack: () => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (v: number) => void;
  onQualityChange: (q: string) => void;
  onToggleFullscreen: () => void;
  onMenuOpen: (open: boolean) => void;
}

export const VideoControlBar: React.FC<VideoControlBarProps> = ({
  show, isPaused, currentTime, duration, volume, isFullscreen,
  subtitleOptions, activeSubtitleId, subtitlesLoading, onSubtitleChange, onSubtitleSearch, onSubtitleShift, onSubtitleStretch, isAdmin,
  isHLSSupported, availableQualities, currentQuality,
  onBack, onTogglePlay, onSeek, onVolumeChange, onQualityChange,
  onToggleFullscreen, onMenuOpen,
}) => {
  const seekBarRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    onMenuOpen(showSubtitleMenu || showQualityMenu);
  }, [showSubtitleMenu, showQualityMenu, onMenuOpen]);

  // Seekbar interaction
  const getFraction = useCallback((clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar) return null;
    const { left, width } = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - left) / width));
  }, []);

  const applySeek = useCallback((clientX: number) => {
    const frac = getFraction(clientX);
    if (frac !== null && duration > 0) onSeek(frac * duration);
  }, [getFraction, duration, onSeek]);

  // Pointer events cover mouse and touch; capturing the pointer keeps the drag
  // going when it leaves the bar.
  const handleSeekPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isSeekingRef.current = true;
    applySeek(e.clientX);
  }, [applySeek]);

  const handleSeekPointerMove = useCallback((e: React.PointerEvent) => {
    setHoverProgress(getFraction(e.clientX));
    if (isSeekingRef.current) applySeek(e.clientX);
  }, [getFraction, applySeek]);

  const handleSeekPointerUp = useCallback(() => {
    isSeekingRef.current = false;
  }, []);

  const toggleSubtitle = useCallback(() => {
    setShowSubtitleMenu(v => !v);
    setShowQualityMenu(false);
  }, []);

  const toggleQuality = useCallback(() => {
    setShowQualityMenu(v => !v);
    setShowSubtitleMenu(false);
  }, []);

  const hasSubtitles = true;
  const hasQuality = isHLSSupported && availableQualities.length > 1;

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const hoverTime = hoverProgress !== null && duration > 0 ? hoverProgress * duration : null;

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 select-none ${
        show ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2 sm:px-4 pt-10 sm:pt-16 pb-2 sm:pb-4">

        {/* Seekbar - the hit area is taller than the visible bar so it's easy to grab on touch */}
        <div
          className="group/seek relative -mt-1.5 mb-1.5 h-8 flex items-center cursor-pointer touch-none"
          onPointerDown={handleSeekPointerDown}
          onPointerMove={handleSeekPointerMove}
          onPointerUp={handleSeekPointerUp}
          onPointerCancel={handleSeekPointerUp}
          onPointerLeave={() => setHoverProgress(null)}
        >
          {/* Hover time tooltip */}
          {hoverTime !== null && (
            <div
              className="absolute -top-5 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-0.5 rounded pointer-events-none whitespace-nowrap"
              style={{ left: `${(hoverTime / duration) * 100}%` }}
            >
              {fmtTime(hoverTime)}
            </div>
          )}

          <div
            ref={seekBarRef}
            className="relative w-full h-1 group-hover/seek:h-1.5 transition-[height] duration-100 bg-white/30 rounded-full"
          >
            {/* Filled */}
            <div
              className="absolute left-0 top-0 h-full bg-white rounded-full pointer-events-none"
              style={{ width: `${progress}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/seek:opacity-100 [@media(hover:none)]:opacity-100 pointer-events-none"
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>

        {/* Controls row - menus anchor to this row on phones so they stay on screen */}
        <div className="relative flex items-center gap-0.5">
          {/* Back */}
          <Btn onClick={onBack} title="Back">
            <ArrowLeft className="w-[18px] h-[18px]" />
          </Btn>

          {/* Play / Pause */}
          <Btn onClick={onTogglePlay} title={isPaused ? 'Play (Space)' : 'Pause (Space)'}>
            {isPaused
              ? <Play className="w-[18px] h-[18px] fill-current" />
              : <Pause className="w-[18px] h-[18px] fill-current" />
            }
          </Btn>

          {/* Volume - phones use their hardware buttons */}
          <div className="hidden sm:flex items-center group/vol">
            <Btn onClick={() => onVolumeChange(volume > 0 ? 0 : 1)} title="Mute (M)">
              <VolumeIcon className="w-[18px] h-[18px]" />
            </Btn>
            {/* Expandable volume slider */}
            <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-[width] duration-200">
              <div
                className="h-1 bg-white/30 rounded-full cursor-pointer mx-1"
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onVolumeChange(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
                }}
              >
                <div className="h-full bg-white rounded-full transition-[width]" style={{ width: `${volume * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Time */}
          <span className="text-white/80 text-xs sm:text-sm tabular-nums whitespace-nowrap ml-1.5">
            {fmtTime(currentTime)} <span className="text-white/40">/</span> {fmtTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Subtitle selector */}
          {hasSubtitles && (
            <div className="sm:relative">
              <Btn onClick={toggleSubtitle} title="Subtitles" active={!!activeSubtitleId}>
                <Subtitles className="w-[18px] h-[18px]" />
              </Btn>
              {showSubtitleMenu && (
                <SubtitleSelector
                  className="absolute bottom-full right-0 mb-2"
                  options={subtitleOptions}
                  activeId={activeSubtitleId}
                  loading={subtitlesLoading}
                  onSelect={onSubtitleChange}
                  onSearch={onSubtitleSearch}
                  onShift={onSubtitleShift}
                  onStretch={onSubtitleStretch}
                  isAdmin={isAdmin}
                  onClose={() => setShowSubtitleMenu(false)}
                />
              )}
            </div>
          )}

          {/* Quality selector */}
          {hasQuality && (
            <div className="sm:relative">
              <Btn onClick={toggleQuality} title="Quality">
                <Settings className="w-[18px] h-[18px]" />
              </Btn>
              {showQualityMenu && (
                <QualitySelector
                  className="absolute bottom-full right-0 mb-2"
                  availableQualities={availableQualities}
                  currentQuality={currentQuality}
                  onQualityChange={onQualityChange}
                  onClose={() => setShowQualityMenu(false)}
                />
              )}
            </div>
          )}

          {/* Fullscreen */}
          <Btn onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
            {isFullscreen
              ? <Minimize2 className="w-[18px] h-[18px]" />
              : <Maximize2 className="w-[18px] h-[18px]" />
            }
          </Btn>
        </div>
      </div>
    </div>
  );
};

function Btn({
  onClick, title, active, children,
}: {
  onClick: () => void;
  title?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
        active
          ? 'text-blue-400 hover:text-blue-300 hover:bg-white/10'
          : 'text-white hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  );
}
