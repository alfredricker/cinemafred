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
  private readonly REQUEST_STORM_THRESHOLD = 3; // Max requests per segment in 5 seconds (more aggressive)
  private readonly REQUEST_STORM_WINDOW = 5000; // 5 seconds (shorter window)

  constructor(config: HLSManagerConfig) {
    this.config = config;
    
    // Preemptively blacklist known problematic segments
    this.preBlacklistKnownBadSegments();
  }
  
  private preBlacklistKnownBadSegments(): void {
    // Add known problematic segments based on the URL pattern you showed
    const knownBadSegments = [
      'segment_319.ts', // The specific segment causing issues
      // Add more as they're discovered
    ];
    
    knownBadSegments.forEach(segment => {
      console.log(`🚫 Pre-blacklisting known bad segment pattern: ${segment}`);
      // We'll match this against URLs in the loader
    });
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
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxFragLookUpTolerance: 0.25,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 1,
      manifestLoadingRetryDelay: 1000,
      // Aggressive settings to prevent request storms
      fragLoadingMaxRetry: 1, // Reduced from 3 to 1 - fail fast
      fragLoadingMaxRetryTimeout: 2000, // Reduced timeout
      fragLoadingRetryDelay: 500, // Faster retry (but only 1 retry)
      fragLoadingTimeOut: 5000, // Reduced from 10000
      levelLoadingMaxRetry: 1, // Reduced retries
      levelLoadingRetryDelay: 500,
      levelLoadingTimeOut: 5000,
      // fLoader: createCustomLoader() as any, // Disabled - causes undefined 'loading' property error
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
    this.hls.on(Events.FRAG_LOADING, this.handleFragLoading.bind(this));
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

  private handleFragLoading(event: Events.FRAG_LOADING, data: any): void {
    if (data.frag && data.frag.url) {
      const segmentUrl = data.frag.url;
      const urlPath = segmentUrl.split('/').pop() || '';
      const segmentId = this.extractSegmentId(segmentUrl);
      
      // EMERGENCY: Stop segment_319 from loading if it slips through
      const isSegment319 = urlPath.includes('segment_319.ts') || 
                           urlPath.includes('segment319.ts') || 
                           segmentId === '319' ||
                           urlPath.includes('319.ts');
      
      if (isSegment319) {
        console.log(`🚨 EMERGENCY: segment_319 detected in loading! Stopping immediately: ${urlPath}`);
        this.blacklistedSegments.add(segmentUrl);
        this.failedSegmentRanges.set(segmentUrl, { 
          start: data.frag.start, 
          end: data.frag.start + data.frag.duration 
        });
        
        // IMMEDIATELY stop loading and seek past
        if (this.hls) {
          this.hls.stopLoad();
          
          const video = this.config.videoRef.current;
          if (video) {
            const jumpTo = data.frag.start + data.frag.duration + 0.5;
            console.log(`🚀 Emergency seek past segment_319: ${jumpTo.toFixed(2)}s`);
            video.currentTime = jumpTo;
          }
          
          setTimeout(() => {
            if (this.hls) {
              console.log('🔄 Restarting HLS after emergency segment_319 block');
              this.hls.startLoad();
            }
          }, 200);
        }
      }
    }
  }

  private handleFragLoaded(event: Events.FRAG_LOADED, data: FragLoadedData): void {
    this.currentStats.loadedBytes += data.frag.byteLength || 0;
    this.config.onStatsUpdate({ ...this.currentStats });
  }

  private handleError(event: Events.ERROR, data: ErrorData): void {
    console.log('HLS Error:', data);
    
    // Handle BOTH network errors AND media parsing errors
    const isFragmentError = (
      (data.type === ErrorTypes.NETWORK_ERROR &&
       (data.details === ErrorDetails.FRAG_LOAD_ERROR || data.details === ErrorDetails.FRAG_LOAD_TIMEOUT)) ||
      (data.type === ErrorTypes.MEDIA_ERROR &&
       data.details === 'fragParsingError')
    ) && data.frag;
    
    if (isFragmentError && data.frag) {
      const frag = data.frag;
      const segmentUrl = frag.url;
      const segmentId = this.extractSegmentId(segmentUrl);
      
      console.log(`🚨 Fragment error for segment ${segmentId}: ${data.details} (fatal: ${data.fatal})`);
      
      // IMMEDIATELY blacklist segment_319 or any segment causing parsing errors
      if (segmentId) {
        const urlPath = segmentUrl.split('/').pop() || '';
        const isSegment319 = urlPath.includes('segment_319.ts') || segmentId === '319';
        const isParsingError = data.details === 'fragParsingError';
        
        if (isSegment319 || isParsingError) {
          console.log(`🚫 Blacklisting problematic segment: ${urlPath} (segment_319: ${isSegment319}, parsing error: ${isParsingError})`);
          this.blacklistedSegments.add(segmentUrl);
          this.failedSegmentRanges.set(segmentUrl, { 
            start: frag.start, 
            end: frag.start + frag.duration 
          });
          
          // AGGRESSIVE: Stop and restart HLS to prevent retries
          if (this.hls) {
            console.log(`🛑 Stopping HLS to prevent retries of segment ${segmentId}`);
            this.hls.stopLoad();
            
            // Force seek past the bad segment
            const video = this.config.videoRef.current;
            if (video) {
              const jumpTo = frag.start + frag.duration + 0.5;
              console.log(`🚀 Force seeking past bad segment from ${video.currentTime.toFixed(2)}s to ${jumpTo.toFixed(2)}s`);
              video.currentTime = jumpTo;
              
              // Restart loading after seeking
              setTimeout(() => {
                if (this.hls) {
                  console.log(`🔄 Restarting HLS after skipping segment ${segmentId}`);
                  this.hls.startLoad();
                }
              }, 100);
            }
          }
          
          return; // Don't retry this segment
        }
        
        // Check for request storm on other segments
        if (this.isRequestStormDetected(segmentId)) {
          console.log(`⚡ Request storm detected for segment ${segmentId} - blacklisting`);
          this.blacklistedSegments.add(segmentUrl);
          this.failedSegmentRanges.set(segmentUrl, { 
            start: frag.start, 
            end: frag.start + frag.duration 
          });
          return; // Don't retry storm segments
        }
      }
      
      // For other segments, blacklist after first failure to prevent retries
      if (!this.blacklistedSegments.has(segmentUrl)) {
        console.log(`⚠️ Blacklisting segment ${segmentId} after error: ${segmentUrl.split('/').pop()}`);
        this.blacklistedSegments.add(segmentUrl);
        this.failedSegmentRanges.set(segmentUrl, { 
          start: frag.start, 
          end: frag.start + frag.duration 
        });
      }
      
      // For fatal errors, try to recover
      if (data.fatal && this.hls) {
        console.log('Attempting to recover from fatal fragment error');
        this.hls.startLoad();
      }
      
      return;
    }
    
    // Handle other fatal errors
    if (data.fatal) {
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
    // Handle different segment URL patterns
    const patterns = [
      /segment_?(\d+)\.ts/,  // segment_319.ts or segment319.ts
      /(\d+)\.ts$/,          // 319.ts
      /seg(\d+)/,            // seg319
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
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