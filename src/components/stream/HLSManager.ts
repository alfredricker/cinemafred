import Hls, { type Fragment } from 'hls.js';
import { HLSManagerConfig, HLSStats, QualityLevel } from './types';

export class HLSManager {
  private hls: Hls | null = null;
  private config: HLSManagerConfig;
  // Store the time ranges of failed segments
  private failedSegmentRanges = new Map<string, { start: number; end: number }>();
  private maxRetries = 3;
  private retryCount = 0;
  private playbackMonitorInterval: NodeJS.Timeout | null = null;
  private lastPlaybackTime = -1;

  constructor(config: HLSManagerConfig) {
    this.config = config;
  }

  initialize(): boolean {
    const video = this.config.videoRef.current;
    if (!video) return false;

    // Check if HLS is supported
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

    // Create HLS instance with optimized config
    this.hls = new Hls({
      debug: false,
      enableWorker: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000, // 60MB
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxFragLookUpTolerance: 0.25,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 1,
      manifestLoadingRetryDelay: 1000,
      // Limit fragment retry behavior to prevent request storms
      fragLoadingMaxRetry: 3,
      fragLoadingMaxRetryTimeout: 5000,
      fragLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      levelLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 10000,
      testBandwidth: true,
      progressive: false,
      enableCEA708Captions: true,
      enableWebVTT: true,
      abrEwmaFastVoD: 3.0,
      abrEwmaSlowVoD: 9.0,
      abrEwmaDefaultEstimate: 500000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      maxStarvationDelay: 4,
      maxLoadingDelay: 4,
      minAutoBitrate: 0,
    });

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

    this.hls.on(Hls.Events.MANIFEST_PARSED, this.handleManifestParsed.bind(this));
    this.hls.on(Hls.Events.LEVEL_SWITCHED, this.handleLevelSwitched.bind(this));
    this.hls.on(Hls.Events.FRAG_LOADED, this.handleFragLoaded.bind(this));
    // No longer need a special FRAG_LOADING handler
    this.hls.on(Hls.Events.ERROR, this.handleError.bind(this));
    
    // Set up a periodic check for when playback gets stuck
    this.setupPlaybackMonitoring();
  }

  private setupPlaybackMonitoring(): void {
    // Clear any existing interval
    if (this.playbackMonitorInterval) {
      clearInterval(this.playbackMonitorInterval);
    }

    // Check every 500ms if playback is stuck
    this.playbackMonitorInterval = setInterval(() => {
      this.monitorPlaybackStall();
    }, 500);
  }

  private monitorPlaybackStall(): void {
    const video = this.config.videoRef.current;
    if (!video || !this.hls || video.paused) {
      // If paused, reset the time tracker
      if (video) this.lastPlaybackTime = video.currentTime;
      return;
    }

    const currentTime = video.currentTime;
    const isStalled = currentTime === this.lastPlaybackTime;
    
    if (isStalled) {
      // Playback is stalled, check if we are near a known bad segment
      for (const [url, range] of this.failedSegmentRanges.entries()) {
        // Check if the current time is stuck right before or inside a failed segment range
        if (currentTime >= range.start - 0.5 && currentTime <= range.end) {
          console.log(`🚨 Playback stalled at a known bad segment (${(range.start).toFixed(2)}s). Jumping to ${(range.end + 0.1).toFixed(2)}s.`);
          
          // Jump over the bad segment
          video.currentTime = range.end + 0.1;
          
          // We've handled the stall, no need to check other ranges
          break;
        }
      }
    }

    this.lastPlaybackTime = currentTime;
  }

  private handleManifestParsed(event: any, data: any): void {
    console.log('HLS manifest parsed, found', data.levels.length, 'quality levels');
    
    // Extract quality levels
    const qualities: QualityLevel[] = data.levels.map((level: any, index: number) => {
      const height = level.height || 0;
      const bitrate = Math.round(level.bitrate / 1000);
      return {
        index,
        label: height > 0 ? `${height}p (${bitrate}k)` : `${bitrate}k`,
        height,
        bitrate
      };
    });

    // Sort by quality (highest first)
    qualities.sort((a, b) => b.height - a.height);
    const qualityLabels = ['auto', ...qualities.map(q => q.label)];
    this.config.onQualitiesUpdate(qualityLabels);
    
    // Reset error state on successful load
    this.retryCount = 0;
  }

  private handleLevelSwitched(event: any, data: any): void {
    if (!this.hls) return;

    const level = this.hls.levels[data.level];
    const quality = level ? `${level.height}p (${Math.round(level.bitrate / 1000)}k)` : `Level ${data.level}`;
    console.log(`🎬 Quality switched to: ${quality}`);
    console.log(`   Resolution: ${level?.width}x${level?.height}`);
    console.log(`   Bitrate: ${level ? Math.round(level.bitrate / 1000) : 'unknown'}k`);
    console.log(`   Codec: ${level?.codecSet || 'unknown'}`);
    
    this.config.onStatsUpdate({
      loadedBytes: 0,
      totalBytes: 0,
      currentLevel: data.level
    });
  }

  private handleFragLoaded(event: any, data: any): void {
    this.config.onStatsUpdate({
      loadedBytes: data.frag.byteLength || 0,
      totalBytes: 0,
      currentLevel: -1
    });
  }

  private handleError(event: any, data: any): void {
    if (!data.fatal) {
      return; // Let hls.js handle non-fatal errors
    }

    const video = this.config.videoRef.current;
    if (!video) return;

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        // Focus only on fragment load errors, which are the most common issue.
        if (
          data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT
        ) {
          const frag = data.frag;
          if (frag) {
            const segmentUrl = frag.url;
            const segmentName = segmentUrl.split('/').pop() || 'unknown';
            const startTime = frag.start;
            const endTime = startTime + frag.duration;

            if (!this.failedSegmentRanges.has(segmentUrl)) {
              console.log(`⚠️ Fragment ${segmentName} failed after all retries. Marking range [${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s] as bad.`);
              this.failedSegmentRanges.set(segmentUrl, { start: startTime, end: endTime });
            }
          }
          // Do not stop the loader. Let it continue trying to load the next segments.
        } else {
          // Handle other fatal network errors
          this.handleGenericFatalError(data);
        }
        break;

      case Hls.ErrorTypes.MEDIA_ERROR:
        this.handleGenericFatalError(data);
        break;

      default:
        console.log('Unhandled fatal error', data);
        this.config.onError(`HLS Error: ${data.details}`);
        break;
    }
  }

  private handleGenericFatalError(data: any): void {
    if (!this.hls) return;
    
    console.log(`Encountered a fatal ${data.type}. Attempting to recover.`);
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          this.hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
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
      this.hls.currentLevel = -1; // Auto quality
    } else {
      // Find the quality index (subtract 1 because 'auto' is first in the array)
      const qualityIndex = this.hls.levels.findIndex(level => {
        const height = level.height || 0;
        const bitrate = Math.round(level.bitrate / 1000);
        const label = height > 0 ? `${height}p (${bitrate}k)` : `${bitrate}k`;
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
    
    if (this.hls) {
      this.hls.destroy();
    }
    
    this.initialize();
  }

  destroy(): void {
    // Clean up monitoring interval
    if (this.playbackMonitorInterval) {
      clearInterval(this.playbackMonitorInterval);
      this.playbackMonitorInterval = null;
    }

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    
    this.failedSegmentRanges.clear();
  }

  get instance(): Hls | null {
    return this.hls;
  }
}
