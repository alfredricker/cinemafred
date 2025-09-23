import Hls, {
  type ErrorData,
  type HlsConfig,
  type LevelSwitchedData,
  type ManifestParsedData,
  type FragLoadedData,
  type LoaderContext,
  type LoaderConfiguration,
  type LoaderCallbacks,
  type LoaderStats,
  type FragmentLoaderContext,
  Events,
  ErrorTypes,
  ErrorDetails,
} from 'hls.js';
import { HLSManagerConfig, HLSStats, QualityLevel } from './types';

export class HLSManager {
  private hls: Hls | null = null;
  private config: HLSManagerConfig;
  private failedSegmentRanges = new Map<string, { start: number; end: number }>();
  private blacklistedSegments = new Set<string>();
  private maxRetries = 3;
  private retryCount = 0;
  private playbackMonitorInterval: NodeJS.Timeout | null = null;
  private lastPlaybackTime = -1;
  private currentStats: HLSStats = { loadedBytes: 0, totalBytes: 0, currentLevel: -1 };
  private segmentRequestCounts = new Map<string, { count: number; lastRequest: number }>();
  private readonly REQUEST_STORM_THRESHOLD = 5; // Max requests per segment in 10 seconds
  private readonly REQUEST_STORM_WINDOW = 10000; // 10 seconds

  constructor(config: HLSManagerConfig) {
    this.config = config;
  }

  initialize(): boolean {
    const video = this.config.videoRef.current;
    if (!video) return false;

    if (Hls.isSupported()) {
      this.initializeHLS();
      return true;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      this.initializeNativeHLS();
      return true;
    }

    return false;
  }

  private initializeHLS(): void {
    const video = this.config.videoRef.current;
    if (!video) return;

    // For now, let's use the default loader and add protection in error handling
    // We can add the custom loader back later if needed

    const hlsConfig: Partial<HlsConfig> = {
      debug: false,
      enableWorker: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxFragLookUpTolerance: 0.25,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 1,
      manifestLoadingRetryDelay: 1000,
      fragLoadingMaxRetry: 3,
      fragLoadingMaxRetryTimeout: 5000,
      fragLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      levelLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 10000,
      // fLoader: CustomFragmentLoader as any, // Temporarily disabled
    };

    this.hls = new Hls(hlsConfig);
    this.setupEventListeners();
    this.loadStream();
  }

  private initializeNativeHLS(): void {
    const video = this.config.videoRef.current;
    if (!video) return;
    const hlsUrl = this.config.getAuthenticatedUrl(true);
    console.log('Using native HLS support:', hlsUrl);
    video.src = hlsUrl;
  }

  private setupEventListeners(): void {
    if (!this.hls) return;
    this.hls.on(Events.MANIFEST_PARSED, this.handleManifestParsed.bind(this));
    this.hls.on(Events.LEVEL_SWITCHED, this.handleLevelSwitched.bind(this));
    this.hls.on(Events.FRAG_LOADED, this.handleFragLoaded.bind(this));
    this.hls.on(Events.ERROR, this.handleError.bind(this));
    this.setupPlaybackMonitoring();
  }

  private setupPlaybackMonitoring(): void {
    if (this.playbackMonitorInterval) {
      clearInterval(this.playbackMonitorInterval);
    }
    this.playbackMonitorInterval = setInterval(() => {
      this.monitorPlaybackStall();
    }, 500);
  }

  private monitorPlaybackStall(): void {
    const video = this.config.videoRef.current;
    if (!video || !this.hls || video.paused) {
      if (video) this.lastPlaybackTime = video.currentTime;
      return;
    }
    
    const currentTime = video.currentTime;
    const isStalled = currentTime === this.lastPlaybackTime && !video.seeking;
    
    // Check if we're approaching or in a known bad segment range
    for (const [, range] of this.failedSegmentRanges.entries()) {
      const approachingSegment = currentTime >= range.start - 1.0 && currentTime < range.start;
      const inBadSegment = currentTime >= range.start && currentTime <= range.end;
      
      if (approachingSegment || (isStalled && inBadSegment)) {
        const jumpTo = range.end + 0.5; // Jump past the bad segment with buffer
        console.log(`🚨 ${approachingSegment ? 'Approaching' : 'Stalled in'} bad segment (${range.start.toFixed(2)}s-${range.end.toFixed(2)}s). Jumping to ${jumpTo.toFixed(2)}s.`);
        
        // Smooth seek to avoid jarring jumps
        video.currentTime = jumpTo;
        
        // Force HLS to start loading from the new position
        if (this.hls && this.hls.media) {
          this.hls.startLoad(jumpTo);
        }
        break;
      }
    }
    
    this.lastPlaybackTime = currentTime;
  }

  private handleManifestParsed(event: Events.MANIFEST_PARSED, data: ManifestParsedData): void {
    console.log('HLS manifest parsed, found', data.levels.length, 'quality levels');
    const qualities: QualityLevel[] = data.levels.map((level, index) => ({
      index,
      label: level.height ? `${level.height}p (${Math.round(level.bitrate / 1000)}k)` : `${Math.round(level.bitrate / 1000)}k`,
      height: level.height || 0,
      bitrate: Math.round(level.bitrate / 1000),
    }));
    qualities.sort((a, b) => b.height - a.height);
    this.config.onQualitiesUpdate(['auto', ...qualities.map(q => q.label)]);
    this.retryCount = 0;
  }

  private handleLevelSwitched(event: Events.LEVEL_SWITCHED, data: LevelSwitchedData): void {
    if (!this.hls) return;
    this.currentStats.currentLevel = data.level;
    this.config.onStatsUpdate({ ...this.currentStats });
  }

  private handleFragLoaded(event: Events.FRAG_LOADED, data: FragLoadedData): void {
    this.currentStats.loadedBytes += data.frag.byteLength || 0;
    this.config.onStatsUpdate({ ...this.currentStats });
  }

  private handleError(event: Events.ERROR, data: ErrorData): void {
    console.log('HLS Error:', data);
    
    if (!data.fatal) {
      // Handle non-fatal errors
      if (
        data.type === ErrorTypes.NETWORK_ERROR &&
        (data.details === ErrorDetails.FRAG_LOAD_ERROR || data.details === ErrorDetails.FRAG_LOAD_TIMEOUT) &&
        data.frag
      ) {
        const frag = data.frag;
        const segmentUrl = frag.url;
        const segmentId = this.extractSegmentId(segmentUrl);
        
        // Track failed segment attempts for request storm detection
        if (segmentId && this.isRequestStormDetected(segmentId)) {
          console.log(`⚡ Request storm detected for segment ${segmentId}, blacklisting URL: ${segmentUrl}`);
          this.blacklistedSegments.add(segmentUrl);
          // Mark the time range as bad to skip during playback
          this.failedSegmentRanges.set(segmentUrl, { start: frag.start, end: frag.start + frag.duration });
        }
      }
      return;
    }

    // Handle fatal errors
    if (
      data.type === ErrorTypes.NETWORK_ERROR &&
      (data.details === ErrorDetails.FRAG_LOAD_ERROR || data.details === ErrorDetails.FRAG_LOAD_TIMEOUT) &&
      data.frag
    ) {
      const frag = data.frag;
      const segmentUrl = frag.url;
      if (!this.failedSegmentRanges.has(segmentUrl)) {
        console.log(`⚠️ Fragment ${frag.sn} failed after all retries. Marking range [${frag.start.toFixed(2)}s - ${(frag.start + frag.duration).toFixed(2)}s] as bad.`);
        this.failedSegmentRanges.set(segmentUrl, { start: frag.start, end: frag.start + frag.duration });
        
        // Also blacklist the segment to prevent future requests
        this.blacklistedSegments.add(segmentUrl);
      }
      
      // Try to recover by skipping the bad segment
      if (this.hls) {
        console.log('Attempting to recover from fragment error by skipping bad segment');
        this.hls.startLoad();
      }
    } else {
      this.handleGenericFatalError(data);
    }
  }

  private handleGenericFatalError(data: ErrorData): void {
    if (!this.hls) return;
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      switch (data.type) {
        case ErrorTypes.NETWORK_ERROR:
          this.hls.startLoad();
          break;
        case ErrorTypes.MEDIA_ERROR:
          this.hls.recoverMediaError();
          break;
      }
    } else {
      this.config.onError(`Failed to recover from ${data.type} after ${this.maxRetries} attempts.`);
    }
  }

  private loadStream(): void {
    if (!this.hls) return;
    const video = this.config.videoRef.current;
    if (!video) return;
    const hlsUrl = this.config.getAuthenticatedUrl(true);
    console.log('Loading HLS stream:', hlsUrl);
    this.hls.loadSource(hlsUrl);
    this.hls.attachMedia(video);
  }

  setQuality(quality: string): void {
    if (!this.hls) return;
    if (quality === 'auto') {
      this.hls.currentLevel = -1;
    } else {
      const qualityIndex = this.hls.levels.findIndex(level => {
        const label = level.height ? `${level.height}p (${Math.round(level.bitrate / 1000)}k)` : `${Math.round(level.bitrate / 1000)}k`;
        return label === quality;
      });
      if (qualityIndex >= 0) {
        this.hls.currentLevel = qualityIndex;
      }
    }
  }

  retry(): void {
    this.retryCount = 0;
    this.failedSegmentRanges.clear();
    this.blacklistedSegments.clear();
    this.segmentRequestCounts.clear();
    if (this.hls) {
      this.hls.destroy();
    }
    this.initialize();
  }

  private extractSegmentId(url: string): string | null {
    const match = url.match(/segment(\d+)\.ts/);
    return match ? match[1] : null;
  }

  private isRequestStormDetected(segmentId: string): boolean {
    const now = Date.now();
    const key = segmentId;
    const existing = this.segmentRequestCounts.get(key);
    
    if (!existing) {
      this.segmentRequestCounts.set(key, { count: 1, lastRequest: now });
      return false;
    }
    
    // Reset count if outside the time window
    if (now - existing.lastRequest > this.REQUEST_STORM_WINDOW) {
      this.segmentRequestCounts.set(key, { count: 1, lastRequest: now });
      return false;
    }
    
    // Increment count
    existing.count++;
    existing.lastRequest = now;
    
    // Check if we've exceeded the threshold
    return existing.count > this.REQUEST_STORM_THRESHOLD;
  }

  destroy(): void {
    if (this.playbackMonitorInterval) {
      clearInterval(this.playbackMonitorInterval);
      this.playbackMonitorInterval = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.failedSegmentRanges.clear();
    this.blacklistedSegments.clear();
    this.segmentRequestCounts.clear();
  }

  get instance(): Hls | null {
    return this.hls;
  }
}