import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, BUCKET_NAME } from './r2';

/**
 * Hybrid HLS manager that uses signed URLs for segments (better performance)
 * but proxies playlists through API (for CORS and authentication)
 */
export class HLSHybridManager {
  
  /**
   * Generate authenticated bitrate playlist with signed segment URLs
   * This provides better performance by allowing direct access to segments
   */
  async generateHybridBitratePlaylist(
    movieId: string,
    bitrate: string,
    expiresIn: number = 3600
  ): Promise<string> {
    // Get the original bitrate playlist
    const bitrateKey = `hls/${movieId}/${bitrate}/playlist.m3u8`;
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: bitrateKey
    });

    const response = await r2Client.send(getCommand);
    if (!response.Body) {
      throw new Error(`Bitrate playlist not found: ${bitrate}`);
    }

    // Read the bitrate playlist content
    const chunks: Buffer[] = [];
    const stream = response.Body as any;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const originalContent = Buffer.concat(chunks).toString('utf-8');

    // Parse and replace segment URLs with signed URLs for direct access
    const lines = originalContent.split('\n');
    const authenticatedLines: string[] = [];

    for (const line of lines) {
      if (line.endsWith('.ts')) {
        // This is a segment file reference - use signed URL for direct R2 access
        const segmentKey = `hls/${movieId}/${bitrate}/${line}`;
        const signedUrl = await this.getSignedSegmentUrl(segmentKey, expiresIn);
        authenticatedLines.push(signedUrl);
      } else {
        authenticatedLines.push(line);
      }
    }

    return authenticatedLines.join('\n');
  }

  /**
   * Generate authenticated master playlist with API URLs for bitrate playlists
   */
  async generateHybridMasterPlaylist(
    movieId: string,
    token: string
  ): Promise<string> {
    // Get the original master playlist
    const masterKey = `hls/${movieId}/playlist.m3u8`;
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: masterKey
    });

    const response = await r2Client.send(getCommand);
    if (!response.Body) {
      throw new Error('Master playlist not found');
    }

    // Read the master playlist content
    const chunks: Buffer[] = [];
    const stream = response.Body as any;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const originalContent = Buffer.concat(chunks).toString('utf-8');

    // Parse and replace bitrate playlist URLs with API URLs
    const lines = originalContent.split('\n');
    const authenticatedLines: string[] = [];

    for (const line of lines) {
      if (line.endsWith('/playlist.m3u8')) {
        // This is a bitrate playlist reference - use API URL
        const bitrate = line.replace('/playlist.m3u8', '');
        const apiUrl = `/api/hls/${movieId}/${bitrate}/playlist.m3u8?token=${encodeURIComponent(token)}&hybrid=true`;
        authenticatedLines.push(apiUrl);
      } else {
        authenticatedLines.push(line);
      }
    }

    return authenticatedLines.join('\n');
  }

  /**
   * Get signed URL for direct segment access
   */
  private async getSignedSegmentUrl(segmentKey: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: segmentKey
    });

    return await getSignedUrl(r2Client, command, { 
      expiresIn,
      // Add CORS headers to signed URL response
      signableHeaders: new Set(['host'])
    });
  }

  /**
   * Check if hybrid mode should be used based on environment
   */
  static shouldUseHybridMode(): boolean {
    // Use hybrid mode in production for better performance
    // Use proxy mode in development to avoid CORS issues
    return process.env.NODE_ENV === 'production' && 
           process.env.ENABLE_HLS_HYBRID === 'true';
  }
}

// Export singleton instance
export const hlsHybridManager = new HLSHybridManager();
