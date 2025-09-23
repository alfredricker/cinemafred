export interface VideoPlayerProps {
  streamUrl: string;
  poster?: string;
  title: string;
  movieId: string;
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
  captionsOn: boolean;
  videoError: string | null;
  retryCount: number;
  isHLSSupported: boolean;
  availableQualities: string[];
  currentQuality: string;
  showQualityMenu: boolean;
  hlsStats: HLSStats;
}

export interface VideoControlsProps {
  onBack: () => void;
  subtitlesUrl?: string | null;
  captionsOn: boolean;
  onToggleCaptions: () => void;
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
  videoRef: React.RefObject<HTMLVideoElement>;
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
