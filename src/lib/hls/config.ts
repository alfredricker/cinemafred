/**
 * HLS Configuration and Performance Settings
 */

export interface HLSConfig {
  // Performance mode
  mode: 'proxy' | 'hybrid' | 'direct';
  
  // Cache settings
  segmentCacheMaxAge: number;
  playlistCacheMaxAge: number;
  masterPlaylistCacheMaxAge: number;
  
  // Security settings
  signedUrlExpiry: number;
  enableCORS: boolean;
  
  // Performance optimizations
  enableRangeRequests: boolean;
  enableCompression: boolean;
  maxConcurrentStreams: number;
}

export const HLS_MODES = {
  /**
   * PROXY MODE (Default for development)
   * - All requests go through your API
   * - Best security and CORS handling
   * - Higher latency, more server load
   * - Good for: Development, high-security requirements
   */
  PROXY: 'proxy' as const,
  
  /**
   * HYBRID MODE (Recommended for production)
   * - Playlists through API (authentication)
   * - Segments via signed URLs (performance)
   * - Balanced security and performance
   * - Good for: Production with moderate security needs
   */
  HYBRID: 'hybrid' as const,
  
  /**
   * DIRECT MODE (Maximum performance)
   * - Everything via signed URLs
   * - Lowest latency, minimal server load
   * - Requires R2 CORS configuration
   * - Good for: High-traffic production with public content
   */
  DIRECT: 'direct' as const,
} as const;

export const DEFAULT_HLS_CONFIG: HLSConfig = {
  mode: 'proxy',
  segmentCacheMaxAge: 31536000, // 1 year (segments are immutable)
  playlistCacheMaxAge: 60, // 1 minute
  masterPlaylistCacheMaxAge: 300, // 5 minutes
  signedUrlExpiry: 3600, // 1 hour
  enableCORS: true,
  enableRangeRequests: true,
  enableCompression: true,
  maxConcurrentStreams: 100,
};

export function getHLSConfig(): HLSConfig {
  return {
    ...DEFAULT_HLS_CONFIG,
    mode: (process.env.HLS_MODE as HLSConfig['mode']) || DEFAULT_HLS_CONFIG.mode,
    segmentCacheMaxAge: parseInt(process.env.HLS_SEGMENT_CACHE_MAX_AGE || '31536000'),
    playlistCacheMaxAge: parseInt(process.env.HLS_PLAYLIST_CACHE_MAX_AGE || '60'),
    masterPlaylistCacheMaxAge: parseInt(process.env.HLS_MASTER_PLAYLIST_CACHE_MAX_AGE || '300'),
    signedUrlExpiry: parseInt(process.env.HLS_SIGNED_URL_EXPIRY || '3600'),
    enableCORS: process.env.HLS_ENABLE_CORS !== 'false',
    enableRangeRequests: process.env.HLS_ENABLE_RANGE_REQUESTS !== 'false',
    enableCompression: process.env.HLS_ENABLE_COMPRESSION !== 'false',
    maxConcurrentStreams: parseInt(process.env.HLS_MAX_CONCURRENT_STREAMS || '100'),
  };
}

/**
 * Performance comparison of different modes:
 * 
 * PROXY MODE:
 * - Latency: +20-50ms per segment
 * - Server CPU: High (processes all video data)
 * - Server Memory: Medium (buffers segments)
 * - Network: 2x bandwidth usage (client->server->R2->server->client)
 * - Security: Excellent (full control)
 * - CORS: No issues
 * 
 * HYBRID MODE:
 * - Latency: +10-20ms for playlists, direct for segments
 * - Server CPU: Low (only processes playlists)
 * - Server Memory: Low (no video buffering)
 * - Network: 1.1x bandwidth usage
 * - Security: Good (authenticated playlists, signed segments)
 * - CORS: Requires R2 CORS for segments
 * 
 * DIRECT MODE:
 * - Latency: Minimal (+0-5ms)
 * - Server CPU: Minimal (only authentication)
 * - Server Memory: Minimal
 * - Network: 1x bandwidth usage (direct to R2)
 * - Security: Basic (signed URLs only)
 * - CORS: Requires full R2 CORS configuration
 */
