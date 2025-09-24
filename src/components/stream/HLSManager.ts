import Hls, {
  type ErrorData,
  type HlsConfig,
  type LevelSwitchedData,
  type ManifestParsedData,
  type FragLoadedData,
  type LoaderContext,
  type LoaderConfiguration,
  type LoaderCallbacks,
  Events,
  ErrorTypes,
  ErrorDetails,
} from 'hls.js';
import { HLSManagerConfig, HLSStats, QualityLevel } from './types';

export class HLSManager {
  private hls: Hls | null = null;
  private config: HLSManagerConfig;
  private failedSegmentRanges = new Map<string, { start: number; end: number }>();
  private maxRetries = 3;
  private retryCount = 0;
  private playbackMonitorInterval: NodeJS.Timeout | null = null;
  private lastPlaybackTime = -1;
  private currentStats: HLSStats = { loadedBytes: 0, totalBytes: 0, currentLevel: -1 };
  private segmentSkipTimer: NodeJS.Timeout | null = null;
  private hlsLoadingStopped = false;

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

    const hlsConfig: Partial<HlsConfig> = {
      debug: false,
      enableWorker: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      // Let hls.js retry a few times before we mark it as failed
      fragLoadingMaxRetry: 2,
      fragLoadingMaxRetryTimeout: 4000,
      fragLoadingRetryDelay: 500,
      fragLoadingTimeOut: 8000,
      // No custom loader - use default HLS.js loader
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
    // Check for stalls frequently
    this.playbackMonitorInterval = setInterval(() => {
      this.monitorPlaybackStall();
    }, 500);
  }

  private monitorPlaybackStall(): void {
    const video = this.config.videoRef.current;
    if (!video || !this.hls || video.paused || video.seeking) {
      if (video) this.lastPlaybackTime = video.currentTime;
      return;
    }
    
    const currentTime = video.currentTime;
    const isStalled = currentTime === this.lastPlaybackTime;
    
    if (isStalled) {
      for (const [, range] of this.failedSegmentRanges.entries()) {
        // If we are stalled within the time range of a known bad segment
        if (currentTime >= range.start - 0.5 && currentTime <= range.end) {
          const jumpTo = range.end + 0.1;
          console.log(`🚨 Playback stalled in bad segment range (${range.start.toFixed(2)}s). Jumping to ${jumpTo.toFixed(2)}s.`);
          video.currentTime = jumpTo;
          break; // Exit after handling one jump
        }
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
    
    const isParsingError = data.type === ErrorTypes.MEDIA_ERROR && data.details === ErrorDetails.FRAG_PARSING_ERROR;
    const isNetworkError = data.type === ErrorTypes.NETWORK_ERROR && (data.details === ErrorDetails.FRAG_LOAD_ERROR || data.details === ErrorDetails.FRAG_LOAD_TIMEOUT);

    // Blacklist segments that are permanently broken
    if ((isParsingError || (isNetworkError && data.fatal)) && data.frag) {
      const frag = data.frag;
      const segmentUrl = frag.url;

      if (!this.failedSegmentRanges.has(segmentUrl)) {
        const startTime = frag.start;
        const endTime = startTime + frag.duration;
        console.log(`🚫 Blacklisting segment ${frag.sn} (${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s) due to ${data.details}.`);
        this.failedSegmentRanges.set(segmentUrl, { start: startTime, end: endTime });
        
        // Stop HLS loading to prevent request storms - simple and clean
        if (this.hls && !this.hlsLoadingStopped) {
          console.log('🛑 Stopping HLS loading to prevent request storms');
          this.hlsLoadingStopped = true;
          this.hls.stopLoad(); // This stops all fragment loading requests
          
          // Start timer-based approach to resume when safe
          this.startSegmentSkipTimer();
        }
      }
    } else if (data.fatal) {
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
    this.hlsLoadingStopped = false;
    
    if (this.segmentSkipTimer) {
      clearInterval(this.segmentSkipTimer);
      this.segmentSkipTimer = null;
    }
    
    if (this.hls) {
      this.hls.destroy();
    }
    this.initialize();
  }

  private startSegmentSkipTimer(): void {
    if (this.segmentSkipTimer) {
      clearInterval(this.segmentSkipTimer);
    }
    
    console.log('⏰ [Step 4] Starting background timer - checking distance every second');
    this.segmentSkipTimer = setInterval(() => {
      this.checkDistanceToFailedSegments();
    }, 1000); // Step 5: Every second that passes, calculate again
  }
  
  private checkDistanceToFailedSegments(): void {
    // Step 1: Tell hls.js to stop making requests (already done in error handler via stopLoad())
    
    // Step 2: Get the current timestamp we are at in the movie
    const video = this.config.videoRef.current;
    if (!video || !this.hls || this.failedSegmentRanges.size === 0) {
      return;
    }
    
    const currentTime = video.currentTime;
    console.log(`⏰ [Step 2] Current timestamp: ${currentTime.toFixed(2)}s`);
    
    // Step 3: Get the timestamp of where the broken segment begins
    // Step 5: Every second that passes, calculate again how far you are from the broken segment
    for (const [segmentUrl, range] of this.failedSegmentRanges.entries()) {
      console.log(`📍 [Step 3] Broken segment starts at: ${range.start.toFixed(2)}s`);
      
      const distanceToSegment = range.start - currentTime;
      console.log(`📏 [Step 5] Distance calculation: ${distanceToSegment.toFixed(1)}s away from bad segment`);
      
      // Step 6: Once you are 3-5 seconds away, skip to the end of the broken segment + ~1 second and resume making hls requests
      if (distanceToSegment > 0 && distanceToSegment <= 5) {
        const jumpTo = range.end + 1; // Jump past the segment + 1 second buffer
        console.log(`⏭️ [Step 6] Approaching bad segment in ${distanceToSegment.toFixed(1)}s. Skipping from ${currentTime.toFixed(2)}s to ${jumpTo.toFixed(2)}s`);
        
        // Skip to safe position
        video.currentTime = jumpTo;
        
        // Resume HLS loading if it was stopped
        if (this.hlsLoadingStopped) {
          console.log('🔄 [Step 6] Resuming HLS requests with startLoad()');
          this.hlsLoadingStopped = false;
          this.hls.startLoad(); // This resumes fragment loading
        }
        
        // Clear the timer since we've handled the skip
        if (this.segmentSkipTimer) {
          clearInterval(this.segmentSkipTimer);
          this.segmentSkipTimer = null;
        }
        
        break; // Only handle one skip at a time
      }
    }
  }

  destroy(): void {
    if (this.playbackMonitorInterval) {
      clearInterval(this.playbackMonitorInterval);
      this.playbackMonitorInterval = null;
    }
    if (this.segmentSkipTimer) {
      clearInterval(this.segmentSkipTimer);
      this.segmentSkipTimer = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.failedSegmentRanges.clear();
    this.hlsLoadingStopped = false;
  }

  get instance(): Hls | null {
    return this.hls;
  }
}