import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, BUCKET_NAME } from '../r2';

export interface HLSSegmentInfo {
  movieId: string;
  bitrate: string;
  segmentNumber: number;
  duration: number;
}

export interface HLSPlaylistInfo {
  movieId: string;
  bitrate?: string; // undefined for master playlist
  segments: HLSSegmentInfo[];
}

export class HLSR2Manager {
  
  /**
   * Get a signed URL for HLS master playlist
   */
  async getHLSPlaylistUrl(movieId: string, expiresIn: number = 3600): Promise<string> {
    const key = `hls/${movieId}/playlist.m3u8`;
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    return await getSignedUrl(r2Client(), command, { expiresIn });
  }

  /**
   * Get a signed URL for a specific bitrate playlist
   */
  async getBitratePlaylistUrl(
    movieId: string, 
    bitrate: string, 
    expiresIn: number = 3600
  ): Promise<string> {
    const key = `hls/${movieId}/${bitrate}/playlist.m3u8`;
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    return await getSignedUrl(r2Client(), command, { expiresIn });
  }

  /**
   * Get a signed URL for an HLS segment
   */
  async getSegmentUrl(
    movieId: string,
    bitrate: string,
    segmentFile: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const key = `hls/${movieId}/${bitrate}/${segmentFile}`;
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    return await getSignedUrl(r2Client(), command, { expiresIn });
  }

  /**
   * Check if HLS files exist for a movie
   */
  async checkHLSExists(movieId: string): Promise<{
    masterPlaylist: boolean;
    bitrates: string[];
    segmentCount: Record<string, number>;
  }> {
    const prefix = `hls/${movieId}/`;
    
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    });

    const response = await r2Client().send(command);
    const objects = response.Contents || [];

    const result = {
      masterPlaylist: false,
      bitrates: [] as string[],
      segmentCount: {} as Record<string, number>
    };

    // Check for master playlist
    result.masterPlaylist = objects.some(obj => 
      obj.Key === `hls/${movieId}/playlist.m3u8`
    );

    // Find bitrates and count segments
    const bitrateSet = new Set<string>();
    
    for (const obj of objects) {
      if (!obj.Key) continue;
      
      const pathParts = obj.Key.split('/');
      if (pathParts.length >= 4 && pathParts[0] === 'hls' && pathParts[1] === movieId) {
        const bitrate = pathParts[2];
        const filename = pathParts[3];
        
        bitrateSet.add(bitrate);
        
        // Count segments (*.ts files)
        if (filename.endsWith('.ts')) {
          result.segmentCount[bitrate] = (result.segmentCount[bitrate] || 0) + 1;
        }
      }
    }

    result.bitrates = Array.from(bitrateSet).sort();
    
    return result;
  }

  /**
   * Delete all HLS files for a movie
   */
  async deleteHLSFiles(movieId: string): Promise<void> {
    const prefix = `hls/${movieId}/`;
    
    // List all objects with the prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    });

    const response = await r2Client().send(listCommand);
    const objects = response.Contents || [];

    if (objects.length === 0) {
      console.log(`No HLS files found for movie ${movieId}`);
      return;
    }

    // Delete all objects
    const deletePromises = objects.map(obj => {
      if (!obj.Key) return Promise.resolve();
      
      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: obj.Key
      });
      
      return r2Client().send(deleteCommand);
    });

    await Promise.all(deletePromises);
    console.log(`Deleted ${objects.length} HLS files for movie ${movieId}`);
  }

  /**
   * Upload HLS playlist with proper content type
   */
  async uploadPlaylist(
    key: string, 
    content: string, 
    isMaster: boolean = false
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: 'application/vnd.apple.mpegurl',
      CacheControl: isMaster ? 'max-age=300' : 'max-age=60', // Master playlist cached less
      Metadata: {
        'hls-type': isMaster ? 'master' : 'bitrate'
      }
    });

    await r2Client().send(command);
  }

  /**
   * Upload HLS segment with proper content type
   */
  async uploadSegment(key: string, segmentData: Buffer): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: segmentData,
      ContentType: 'video/mp2t',
      CacheControl: 'max-age=31536000', // Segments are immutable, cache for 1 year
    });

    await r2Client().send(command);
  }

  /**
   * Generate authenticated HLS URLs for a complete movie
   * This creates a master playlist with API URLs
   */
  async generateAuthenticatedHLSUrls(
    movieId: string,
    token: string
  ): Promise<{
    masterPlaylistUrl: string;
    authenticatedMasterPlaylist: string;
  }> {
    // Get the original master playlist
    const masterKey = `hls/${movieId}/playlist.m3u8`;
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: masterKey
    });

    const response = await r2Client().send(getCommand);
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
        // This is a bitrate playlist reference
        const bitrate = line.replace('/playlist.m3u8', '');
        const apiUrl = `/api/hls/${movieId}/${bitrate}/playlist.m3u8?token=${encodeURIComponent(token)}`;
        authenticatedLines.push(apiUrl);
      } else {
        authenticatedLines.push(line);
      }
    }

    const authenticatedMasterPlaylist = authenticatedLines.join('\n');

    // Master playlist URL is served through our API
    const masterPlaylistUrl = `/api/hls/${movieId}?token=${encodeURIComponent(token)}`;

    return {
      masterPlaylistUrl,
      authenticatedMasterPlaylist
    };
  }

  /**
   * Get HLS statistics for a movie
   */
  async getHLSStats(movieId: string): Promise<{
    exists: boolean;
    bitrates: string[];
    totalSegments: number;
    totalSize: number;
    estimatedDuration: number;
  }> {
    const hlsInfo = await this.checkHLSExists(movieId);
    
    if (!hlsInfo.masterPlaylist) {
      return {
        exists: false,
        bitrates: [],
        totalSegments: 0,
        totalSize: 0,
        estimatedDuration: 0
      };
    }

    // Calculate total segments and estimate size
    const totalSegments = Object.values(hlsInfo.segmentCount).reduce((sum, count) => sum + count, 0);
    
    // Estimate duration (assuming 6-second segments)
    const estimatedDuration = Math.max(...Object.values(hlsInfo.segmentCount)) * 6;

    // Get size information
    const prefix = `hls/${movieId}/`;
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    });

    const response = await r2Client().send(listCommand);
    const totalSize = (response.Contents || []).reduce((sum, obj) => sum + (obj.Size || 0), 0);

    return {
      exists: true,
      bitrates: hlsInfo.bitrates,
      totalSegments,
      totalSize,
      estimatedDuration
    };
  }

  /**
   * Generate authenticated bitrate playlist with API segment URLs
   */
  async generateAuthenticatedBitratePlaylist(
    movieId: string,
    bitrate: string,
    token: string
  ): Promise<string> {
    // Get the original bitrate playlist
    const bitrateKey = `hls/${movieId}/${bitrate}/playlist.m3u8`;
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: bitrateKey
    });

    const response = await r2Client().send(getCommand);
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

    // Parse and replace segment URLs with API URLs
    const lines = originalContent.split('\n');
    const authenticatedLines: string[] = [];

    for (const line of lines) {
      if (line.endsWith('.ts')) {
        // This is a segment file reference - replace with API URL
        const apiUrl = `/api/hls/${movieId}/${bitrate}/${line}?token=${encodeURIComponent(token)}`;
        authenticatedLines.push(apiUrl);
      } else {
        authenticatedLines.push(line);
      }
    }

    return authenticatedLines.join('\n');
  }

  /**
   * Validate HLS structure for a movie
   */
  async validateHLSStructure(movieId: string): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      const hlsInfo = await this.checkHLSExists(movieId);

      // Check master playlist exists
      if (!hlsInfo.masterPlaylist) {
        issues.push('Master playlist missing');
        return { valid: false, issues, recommendations };
      }

      // Check we have bitrates
      if (hlsInfo.bitrates.length === 0) {
        issues.push('No bitrate variants found');
      } else if (hlsInfo.bitrates.length < 3) {
        recommendations.push(`Consider adding more bitrate variants (currently ${hlsInfo.bitrates.length})`);
      }

      // Check segment counts are consistent
      const segmentCounts = Object.values(hlsInfo.segmentCount);
      const minSegments = Math.min(...segmentCounts);
      const maxSegments = Math.max(...segmentCounts);

      if (maxSegments - minSegments > 1) {
        issues.push('Inconsistent segment counts across bitrates');
      }

      // Check for common bitrate patterns
      const commonBitrates = ['240p', '360p', '480p', '720p', '1080p'];
      const missingCommon = commonBitrates.filter(br => !hlsInfo.bitrates.includes(br));
      
      if (missingCommon.length > 0 && hlsInfo.bitrates.length < 4) {
        recommendations.push(`Consider adding common bitrates: ${missingCommon.slice(0, 2).join(', ')}`);
      }

      const valid = issues.length === 0;

      return { valid, issues, recommendations };

    } catch (error) {
      issues.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, issues, recommendations };
    }
  }
}

// Export singleton instance
export const hlsR2Manager = new HLSR2Manager();
