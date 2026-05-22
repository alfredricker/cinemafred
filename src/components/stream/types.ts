import type { SubtitleOption } from '@/hooks/useSubtitles';

export type { SubtitleOption };

export interface VideoPlayerProps {
  streamUrl: string;
  poster?: string;
  title: string;
  movieId: string;
  movieYear?: number;
  subtitlesUrl?: string | null;
  isAdmin?: boolean;
  onClose?: () => void;
  useHLS?: boolean;
}

export interface HLSStats {
  loadedBytes: number;
  totalBytes: number;
  currentLevel: number;
}

export interface QualityLevel {
  index: number;
  label: string;
  height: number;
  bitrate: number;
}

export interface VideoPlayerState {
  videoError: string | null;
  retryCount: number;
  isHLSSupported: boolean;
  availableQualities: string[];
  currentQuality: string;
  showQualityMenu: boolean;
  showSubtitleMenu: boolean;
  hlsStats: HLSStats;
}

export interface VideoControlsProps {
  onBack: () => void;
  subtitleOptions: SubtitleOption[];
  activeSubtitleId: string | null;
  subtitlesLoading: boolean;
  onSubtitleChange: (id: string | null) => void;
  showSubtitleMenu: boolean;
  onToggleSubtitleMenu: () => void;
  isHLSSupported: boolean;
  availableQualities: string[];
  currentQuality: string;
  showQualityMenu: boolean;
  onToggleQualityMenu: () => void;
  onQualityChange: (quality: string) => void;
}

export interface QualitySelectorProps {
  availableQualities: string[];
  currentQuality: string;
  onQualityChange: (quality: string) => void;
  onClose: () => void;
}

export interface HLSManagerConfig {
  movieId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onError: (error: string) => void;
  onStatsUpdate: (stats: HLSStats) => void;
  onQualitiesUpdate: (qualities: string[]) => void;
  getAuthenticatedUrl: (isHLS: boolean) => string;
}

export interface ErrorOverlayProps {
  error: string;
  onRetry: () => void;
  onFallbackToMP4?: () => void;
  showMP4Fallback: boolean;
}
