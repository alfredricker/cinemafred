#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';

interface SegmentationOptions {
  inputPath: string;
  movieId: string;
  outputDir?: string;
  segmentDuration?: number;
  bitrates?: BitrateConfig[];
}

interface BitrateConfig {
  name: string;
  videoBitrate: string;
  audioBitrate: string;
  resolution: string;
  maxrate: string;
  bufsize: string;
}

// Optimized bitrate configurations - 480p + original quality only
const DEFAULT_BITRATES: BitrateConfig[] = [
  {
    name: '480p',
    videoBitrate: '1400k',
    audioBitrate: '128k',
    resolution: '854x480',
    maxrate: '1498k',
    bufsize: '2100k'
  }
  // Original quality will be added dynamically based on source video
];

class HLSSegmenter {
  private tempDir: string;

  constructor() {
    this.tempDir = '';
  }

  /**
   * Main segmentation function
   */
  async segmentVideo(options: SegmentationOptions): Promise<string> {
    const {
      inputPath,
      movieId,
      outputDir = os.tmpdir(),
      segmentDuration = 6,
      bitrates = DEFAULT_BITRATES
    } = options;

    console.log(`🎬 Starting HLS segmentation for movie: ${movieId}`);
    console.log(`📁 Input: ${inputPath}`);
    console.log(`⏱️  This may take several minutes for large videos...`);

    // Create temporary directory
    this.tempDir = path.join(outputDir, `hls_${movieId}_${Date.now()}`);
    await fs.mkdir(this.tempDir, { recursive: true });

    try {
      // Get video info first
      console.log(`🔍 [STEP 2A/4] Analyzing video properties...`);
      const videoInfo = await this.getVideoInfo(inputPath);
      console.log(`   Duration: ${(videoInfo.duration / 60).toFixed(1)} minutes`);
      console.log(`   Resolution: ${videoInfo.width}x${videoInfo.height}`);
      console.log(`   Bitrate: ${(videoInfo.bitrate / 1000000).toFixed(1)} Mbps`);

      // Create bitrate configurations including original quality
      const bitrateConfigs = this.createBitrateConfigs(bitrates, videoInfo);
      console.log(`🎯 [STEP 2B/4] Creating ${bitrateConfigs.length} quality levels:`);
      bitrateConfigs.forEach(b => console.log(`   - ${b.name} (${b.resolution}) @ ${b.videoBitrate}`));
      
      // Generate segments for each bitrate
      console.log(`⚙️  [STEP 2C/4] Processing video segments...`);
      const playlistPaths: string[] = [];
      
      for (let i = 0; i < bitrateConfigs.length; i++) {
        const bitrate = bitrateConfigs[i];
        console.log(`   Processing ${bitrate.name} (${i + 1}/${bitrateConfigs.length})...`);
        const segmentStartTime = Date.now();
        
        const playlistPath = await this.generateBitrateSegments(
          inputPath,
          bitrate,
          segmentDuration,
          movieId
        );
        
        const segmentTime = Date.now() - segmentStartTime;
        console.log(`   ✅ ${bitrate.name} completed in ${(segmentTime / 1000).toFixed(1)}s`);
        playlistPaths.push(playlistPath);
      }

      // Create master playlist
      const masterPlaylistPath = await this.createMasterPlaylist(
        bitrateConfigs,
        movieId
      );

      // Upload all files to R2
      console.log(`📤 [STEP 3/4] Uploading HLS files to R2...`);
      await this.uploadToR2(movieId, masterPlaylistPath, playlistPaths);

      console.log(`✅ HLS segmentation completed for movie: ${movieId}`);
      console.log(`📁 Final structure: hls/${movieId}/playlist.m3u8`);
      return `hls/${movieId}/playlist.m3u8`;

    } finally {
      // Cleanup temporary files
      await this.cleanup();
    }
  }

  /**
   * Get video information using ffprobe
   */
  private async getVideoInfo(inputPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inputPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed with code ${code}`));
          return;
        }

        try {
          const info = JSON.parse(output);
          const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
          resolve({
            duration: parseFloat(info.format.duration),
            width: videoStream?.width || 0,
            height: videoStream?.height || 0,
            bitrate: parseInt(info.format.bit_rate) || 0
          });
        } catch (error) {
          reject(error);
        }
      });

      ffprobe.on('error', reject);
    });
  }

  /**
   * Create bitrate configurations: 480p (if source is higher) + original quality
   */
  private createBitrateConfigs(baseBitrates: BitrateConfig[], videoInfo: any): BitrateConfig[] {
    const configs: BitrateConfig[] = [];
    const { width, height, bitrate: sourceBitrate } = videoInfo;

    // Add 480p if source resolution is higher than 480p
    if (height > 480) {
      const config480p = baseBitrates.find(b => b.name === '480p');
      if (config480p) {
        configs.push(config480p);
      }
    }

    // Always add original quality with better bitrate calculation
    const originalQualityName = this.getQualityName(height);
    const originalBitrate = Math.max(sourceBitrate || 0, 2000000); // Minimum 2 Mbps
    
    // Use higher quality for original - 95% of source bitrate instead of 80%
    const targetBitrate = Math.floor(originalBitrate * 0.95 / 1000); // 95% of source bitrate
    const maxBitrate = Math.floor(originalBitrate * 1.1 / 1000); // Allow 110% for peaks
    const bufferSize = Math.floor(originalBitrate * 1.5 / 1000); // Larger buffer for quality
    
    console.log(`📊 Original video analysis:`);
    console.log(`   Source resolution: ${width}x${height}`);
    console.log(`   Source bitrate: ${(originalBitrate / 1000000).toFixed(1)} Mbps`);
    console.log(`   Target bitrate: ${(targetBitrate / 1000).toFixed(1)} Mbps (${((targetBitrate * 1000 / originalBitrate) * 100).toFixed(1)}% of source)`);
    console.log(`   Max bitrate: ${(maxBitrate / 1000).toFixed(1)} Mbps`);
    
    configs.push({
      name: originalQualityName,
      videoBitrate: `${targetBitrate}k`,
      audioBitrate: '192k',
      resolution: `${width}x${height}`,
      maxrate: `${maxBitrate}k`,
      bufsize: `${bufferSize}k`
    });

    return configs;
  }

  /**
   * Get quality name based on height
   */
  private getQualityName(height: number): string {
    if (height >= 2160) return 'original-4k';
    if (height >= 1440) return 'original-1440p';
    if (height >= 1080) return 'original-1080p';
    if (height >= 720) return 'original-720p';
    if (height >= 480) return 'original-480p';
    return 'original';
  }

  /**
   * Generate segments for a specific bitrate
   */
  private async generateBitrateSegments(
    inputPath: string,
    bitrate: BitrateConfig,
    segmentDuration: number,
    movieId: string
  ): Promise<string> {
    const outputDir = path.join(this.tempDir, bitrate.name);
    await fs.mkdir(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');

    return new Promise((resolve, reject) => {
      const isOriginalQuality = bitrate.name.startsWith('original');
      
      const ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:v', bitrate.videoBitrate,
        '-b:a', bitrate.audioBitrate,
        '-maxrate', bitrate.maxrate,
        '-bufsize', bitrate.bufsize
      ];

      // Only scale if not original quality
      if (!isOriginalQuality) {
        ffmpegArgs.push('-vf', `scale=${bitrate.resolution}`);
      }

      // Enhanced quality settings
      ffmpegArgs.push(
        '-preset', isOriginalQuality ? 'slower' : 'medium', // Even better quality for original
        '-crf', isOriginalQuality ? '18' : '23', // Constant Rate Factor for quality
        '-profile:v', 'high', // H.264 high profile for better compression
        '-level', '4.1', // H.264 level
        '-pix_fmt', 'yuv420p', // Pixel format for compatibility
        '-g', '48', // GOP size (2 seconds at 24fps)
        '-keyint_min', '48', // Minimum keyframe interval
        '-sc_threshold', '0', // Disable scene change detection
        '-b_strategy', '1', // B-frame strategy
        '-bf', '3', // Max B-frames
        '-refs', '3', // Reference frames
        '-f', 'hls',
        '-hls_time', segmentDuration.toString(),
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', segmentPattern,
        playlistPath
      );

      console.log(`Running FFmpeg for ${bitrate.name}:`, 'ffmpeg', ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      ffmpeg.stderr.on('data', (data) => {
        // Log FFmpeg progress
        const output = data.toString();
        if (output.includes('time=')) {
          process.stdout.write(`\r${bitrate.name}: ${output.match(/time=(\S+)/)?.[1] || ''}`);
        }
      });

      ffmpeg.on('close', (code) => {
        console.log(`\n${bitrate.name} encoding finished with code ${code}`);
        if (code !== 0) {
          reject(new Error(`FFmpeg failed for ${bitrate.name} with code ${code}`));
          return;
        }
        resolve(playlistPath);
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Create master playlist that references all bitrate playlists
   */
  private async createMasterPlaylist(
    bitrates: BitrateConfig[],
    movieId: string
  ): Promise<string> {
    const masterPlaylistPath = path.join(this.tempDir, 'playlist.m3u8');
    
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    
    for (const bitrate of bitrates) {
      const [width, height] = bitrate.resolution.split('x').map(Number);
      const bandwidth = parseInt(bitrate.videoBitrate.replace('k', '')) * 1000 + 
                       parseInt(bitrate.audioBitrate.replace('k', '')) * 1000;
      
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height}\n`;
      content += `${bitrate.name}/playlist.m3u8\n\n`;
    }

    await fs.writeFile(masterPlaylistPath, content);
    return masterPlaylistPath;
  }

  /**
   * Upload all HLS files to R2 storage
   */
  private async uploadToR2(
    movieId: string,
    masterPlaylistPath: string,
    bitratePlaylistPaths: string[]
  ): Promise<void> {
    console.log(`   📤 Uploading to R2 structure: hls/${movieId}/`);

    // Upload master playlist
    console.log(`   📄 Uploading master playlist...`);
    await this.uploadFileToR2(
      masterPlaylistPath,
      `hls/${movieId}/playlist.m3u8`,
      'application/vnd.apple.mpegurl'
    );

    let totalSegments = 0;
    
    // Upload bitrate playlists and segments
    for (let i = 0; i < bitratePlaylistPaths.length; i++) {
      const playlistPath = bitratePlaylistPaths[i];
      const bitrateName = path.basename(path.dirname(playlistPath));
      const segmentDir = path.dirname(playlistPath);

      console.log(`   📁 Uploading ${bitrateName} folder (${i + 1}/${bitratePlaylistPaths.length})...`);

      // Upload bitrate playlist
      await this.uploadFileToR2(
        playlistPath,
        `hls/${movieId}/${bitrateName}/playlist.m3u8`,
        'application/vnd.apple.mpegurl'
      );

      // Upload segments
      const files = await fs.readdir(segmentDir);
      const segmentFiles = files.filter(f => f.endsWith('.ts'));

      for (const segmentFile of segmentFiles) {
        const segmentPath = path.join(segmentDir, segmentFile);
        await this.uploadFileToR2(
          segmentPath,
          `hls/${movieId}/${bitrateName}/${segmentFile}`,
          'video/mp2t'
        );
      }

      totalSegments += segmentFiles.length;
      console.log(`   ✅ ${bitrateName}: ${segmentFiles.length} segments uploaded`);
    }

    console.log(`✅ Upload complete: ${totalSegments} total segments + ${bitratePlaylistPaths.length + 1} playlists`);
    console.log(`📁 Final structure:`);
    console.log(`   hls/${movieId}/playlist.m3u8 (master)`);
    for (const playlistPath of bitratePlaylistPaths) {
      const bitrateName = path.basename(path.dirname(playlistPath));
      console.log(`   hls/${movieId}/${bitrateName}/playlist.m3u8`);
    }
  }

  /**
   * Upload a single file to R2
   */
  private async uploadFileToR2(
    filePath: string,
    key: string,
    contentType: string
  ): Promise<void> {
    const fileContent = await fs.readFile(filePath);
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType
    });

    await r2Client.send(command);
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
        console.log('Temporary files cleaned up');
      } catch (error) {
        console.warn('Failed to cleanup temporary files:', error);
      }
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: tsx hls-segmenter.ts <input-file> <movie-id> [segment-duration]');
    process.exit(1);
  }

  const [inputPath, movieId, segmentDurationStr] = args;
  const segmentDuration = segmentDurationStr ? parseInt(segmentDurationStr) : 6;

  const segmenter = new HLSSegmenter();
  
  segmenter.segmentVideo({
    inputPath,
    movieId,
    segmentDuration
  }).then((hlsPath) => {
    console.log(`\nHLS segmentation completed!`);
    console.log(`Master playlist: ${hlsPath}`);
  }).catch((error) => {
    console.error('Segmentation failed:', error);
    process.exit(1);
  });
}

export { HLSSegmenter };
