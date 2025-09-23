import Hls, { type Fragment } from 'hls.js';
import { HLSManagerConfig, HLSStats, QualityLevel } from './types';

export class HLSManager {
  private hls: Hls | null = null;
  private config: HLSManagerConfig;
  private failedSegments = new Set<string>();
  private segmentRetryCount = new Map<string, number>();
  private maxRetries = 3;
  private retryCount = 0;

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
    this.hls.on(Hls.Events.FRAG_LOADING, this.handleFragLoading.bind(this));
    this.hls.on(Hls.Events.ERROR, this.handleError.bind(this));
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

  private handleFragLoading(event: any, data: any): void {
    const segmentUrl = data.frag?.url || '';
    const segmentName = segmentUrl.split('/').pop() || '';
    
    if (this.failedSegments.has(segmentUrl)) {
      console.log(`🚫 Preventing load of known bad segment: ${segmentName}`);
      this.skipAndRestart(data.frag);
      return;
    }
  }

  private handleError(event: any, data: any): void {
    console.error('HLS Error:', data);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Current URL:', window.location.href);
    
    const video = this.config.videoRef.current;
    if (!video) return;

    // Handle buffer stalled errors first
    if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
      console.log('🔄 Buffer stalled, attempting to resume playback');
      if (!data.fatal) {
        video.currentTime += 0.1;
        if (video.paused) {
          video.play().catch(err => console.log('Play failed after buffer stall:', err));
        }
      }
      return;
    }
    
    // Handle fragment errors with immediate skip
    if (this.isFragmentError(data)) {
      this.handleFragmentError(data);
      return;
    }
    
    // Handle fatal errors
    if (data.fatal) {
      this.handleFatalError(data);
    }
  }

  private isFragmentError(data: any): boolean {
    return (data.type === Hls.ErrorTypes.NETWORK_ERROR || data.type === Hls.ErrorTypes.MEDIA_ERROR) &&
           (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || 
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR ||
            data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR);
  }

  private handleFragmentError(data: any): void {
    const video = this.config.videoRef.current;
    if (!video) return;

    const segmentUrl = data.frag?.url || 'unknown';
    const segmentName = segmentUrl.split('/').pop() || 'unknown';
    
    console.log(`⚠️ Fragment error (${data.details}) for ${segmentName} - IMMEDIATELY skipping`);
    this.failedSegments.add(segmentUrl);
    
    // Force skip to next segment immediately
    const currentTime = video.currentTime;
    const segmentDuration = 6;
    const nextSegmentTime = Math.ceil(currentTime / segmentDuration) * segmentDuration;
    
    console.log(`🚀 Force skipping from ${currentTime.toFixed(2)}s to ${nextSegmentTime.toFixed(2)}s`);
    video.currentTime = nextSegmentTime + 0.1;
    
    if (!video.paused) {
      video.play().catch(err => console.log('Play failed after force skip:', err));
    }
    
    // Tell HLS to continue loading from the new position
    if (this.hls) {
      this.hls.startLoad(video.currentTime);
    }
  }

  private handleFatalError(data: any): void {
    if (!this.hls) return;

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
          const segmentUrl = data.frag?.url || 'unknown';
          const segmentName = segmentUrl.split('/').pop() || 'unknown';
          
          console.log(`⚠️ Fragment ${segmentName} failed to load after all retries. Skipping.`);
          this.failedSegments.add(segmentUrl);
          this.skipAndRestart(data.frag);
          return;
        }

        console.log('Fatal network error encountered, trying to recover');
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          this.hls.startLoad();
        } else {
          this.config.onError('Network error: Failed to load video after multiple attempts');
        }
        break;

      case Hls.ErrorTypes.MEDIA_ERROR:
        console.log('Fatal media error encountered, trying to recover');
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          this.hls.recoverMediaError();
        } else {
          this.config.onError('Media error: Unable to decode video');
        }
        break;

      default:
        console.log('Fatal error, cannot recover');
        this.config.onError(`HLS Error: ${data.details}`);
        break;
    }
  }

  private skipAndRestart(frag: Fragment | undefined): void {
    if (!this.hls) return;

    const video = this.config.videoRef.current;
    if (!video) return;

    this.hls.stopLoad();
    
    const currentTime = video.currentTime;
    let skipTo: number;

    if (frag?.start !== undefined && frag?.duration !== undefined) {
      // Precise skip to the end of the failed fragment
      skipTo = frag.start + frag.duration + 0.1;
    } else {
      // Fallback: jump forward by a segment duration
      skipTo = currentTime + (frag?.duration || 6);
    }

    // Only seek if we're moving forward to prevent getting stuck
    if (skipTo > currentTime) {
      console.log(`🚀 Force skipping from ${currentTime.toFixed(2)}s to ${skipTo.toFixed(2)}s`);
      video.currentTime = skipTo;
      
      if (video.paused) {
        video.play().catch(err => console.log('Play failed after force skip:', err));
      }
      
      // Resume loading from the new position
      this.hls.startLoad(video.currentTime);
    } else {
      console.warn(`⚠️ Skip destination ${skipTo.toFixed(2)}s is not ahead of current time ${currentTime.toFixed(2)}s. Restarting load at current position.`);
      this.hls.startLoad(video.currentTime);
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
    this.failedSegments.clear();
    this.segmentRetryCount.clear();
    
    if (this.hls) {
      this.hls.destroy();
    }
    
    this.initialize();
  }

  destroy(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    
    this.failedSegments.clear();
    this.segmentRetryCount.clear();
  }

  get instance(): Hls | null {
    return this.hls;
  }
}
