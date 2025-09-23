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
  include480p?: boolean; // Optional flag to include 480p quality
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
   * Check if HLS files already exist in R2 for this movie
   */
  private async checkHLSExists(movieId: string): Promise<boolean> {
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `hls/${movieId}/`,
        MaxKeys: 1
      });

      const response = await r2Client().send(command);
      return (response.Contents && response.Contents.length > 0) || false;
    } catch (error) {
      console.warn('Warning: Could not check existing HLS files:', error);
      return false;
    }
  }

  /**
   * Main segmentation function
   */
  async segmentVideo(options: SegmentationOptions & { force?: boolean }): Promise<string> {
    const {
      inputPath,
      movieId,
      outputDir = os.tmpdir(),
      segmentDuration = 6,
      bitrates = DEFAULT_BITRATES,
      include480p = false,
      force = false
    } = options;

    console.log(`🎬 Starting HLS segmentation for movie: ${movieId}`);
    console.log(`📁 Input: ${inputPath}`);

    // Check if HLS already exists
    const hlsExists = await this.checkHLSExists(movieId);
    if (hlsExists && !force) {
      throw new Error(`HLS files already exist for movie ${movieId}. Use --force flag to overwrite.`);
    }

    if (force && hlsExists) {
      console.log(`🔄 Force mode enabled - overwriting existing HLS files`);
    }

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
      const bitrateConfigs = this.createBitrateConfigs(bitrates, videoInfo, include480p);
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
          movieId,
          videoInfo
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
   * Get video information using ffprobe with enhanced error handling
   */
  private async getVideoInfo(inputPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-show_error',
        inputPath
      ]);

      let output = '';
      let errorOutput = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed with code ${code}. Error: ${errorOutput}`));
          return;
        }

        try {
          const info = JSON.parse(output);
          
          // Check for errors in the probe result
          if (info.error) {
            reject(new Error(`Video file error: ${info.error.string}`));
            return;
          }

          const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
          const audioStream = info.streams.find((s: any) => s.codec_type === 'audio');
          
          if (!videoStream) {
            reject(new Error('No video stream found in the input file'));
            return;
          }

          // Enhanced video info with codec details
          const videoInfo = {
            duration: parseFloat(info.format.duration) || 0,
            width: videoStream.width || 0,
            height: videoStream.height || 0,
            bitrate: parseInt(info.format.bit_rate) || 0,
            videoCodec: videoStream.codec_name,
            audioCodec: audioStream?.codec_name || 'none',
            pixelFormat: videoStream.pix_fmt,
            frameRate: this.parseFrameRate(videoStream.r_frame_rate),
            hasAudio: !!audioStream
          };

          // Validate video properties
          this.validateVideoProperties(videoInfo);

          resolve(videoInfo);
        } catch (error) {
          reject(new Error(`Failed to parse video info: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      ffprobe.on('error', (error) => {
        reject(new Error(`ffprobe process error: ${error.message}`));
      });
    });
  }

  /**
   * Parse frame rate from FFprobe format (e.g., "24000/1001" -> 23.976)
   */
  private parseFrameRate(frameRateStr: string): number {
    if (!frameRateStr || frameRateStr === '0/0') return 0;
    
    const parts = frameRateStr.split('/');
    if (parts.length === 2) {
      const numerator = parseInt(parts[0]);
      const denominator = parseInt(parts[1]);
      return denominator > 0 ? numerator / denominator : 0;
    }
    
    return parseFloat(frameRateStr) || 0;
  }

  /**
   * Validate video properties and warn about potential issues
   */
  private validateVideoProperties(videoInfo: any): void {
    const issues: string[] = [];

    if (videoInfo.duration <= 0) {
      issues.push('Invalid or missing duration');
    }

    if (videoInfo.width <= 0 || videoInfo.height <= 0) {
      issues.push('Invalid video dimensions');
    }

    if (!videoInfo.hasAudio) {
      console.log('⚠️  Warning: No audio stream detected - will encode video-only HLS');
    }

    // Check for problematic codecs
    const problematicVideoCodecs = ['rv40', 'rv30', 'wmv3', 'vc1'];
    if (problematicVideoCodecs.includes(videoInfo.videoCodec)) {
      console.log(`⚠️  Warning: Video codec '${videoInfo.videoCodec}' may require special handling`);
    }

    // Check for unusual pixel formats
    const supportedPixelFormats = ['yuv420p', 'yuv422p', 'yuv444p', 'yuvj420p', 'yuvj422p', 'yuvj444p'];
    if (videoInfo.pixelFormat && !supportedPixelFormats.includes(videoInfo.pixelFormat)) {
      console.log(`⚠️  Warning: Unusual pixel format '${videoInfo.pixelFormat}' detected`);
    }

    // Check for very high frame rates
    if (videoInfo.frameRate > 60) {
      console.log(`⚠️  Warning: High frame rate detected (${videoInfo.frameRate.toFixed(2)} fps) - may increase encoding time`);
    }

    if (issues.length > 0) {
      throw new Error(`Video validation failed: ${issues.join(', ')}`);
    }
  }

  /**
   * Create bitrate configurations: original quality only (unless 480p is explicitly requested)
   */
  private createBitrateConfigs(baseBitrates: BitrateConfig[], videoInfo: any, include480p: boolean = false): BitrateConfig[] {
    const configs: BitrateConfig[] = [];
    const { width, height, bitrate: sourceBitrate } = videoInfo;

    // Add 480p only if explicitly requested and source resolution is higher than 480p
    if (include480p && height > 480) {
      const config480p = baseBitrates.find(b => b.name === '480p');
      if (config480p) {
        configs.push(config480p);
        console.log(`📺 Including 480p quality as requested`);
      }
    } else if (!include480p) {
      console.log(`📺 Skipping 480p quality (use --include-480p flag to enable)`);
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
   * Generate segments for a specific bitrate with fallback options
   */
  private async generateBitrateSegments(
    inputPath: string,
    bitrate: BitrateConfig,
    segmentDuration: number,
    movieId: string,
    videoInfo?: any
  ): Promise<string> {
    const outputDir = path.join(this.tempDir, bitrate.name);
    await fs.mkdir(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');

    // Try multiple encoding strategies if the first one fails
    const strategies = [
      () => this.generateWithStrategy(inputPath, bitrate, segmentDuration, playlistPath, segmentPattern, 'optimal', videoInfo),
      () => this.generateWithStrategy(inputPath, bitrate, segmentDuration, playlistPath, segmentPattern, 'compatible', videoInfo),
      () => this.generateWithStrategy(inputPath, bitrate, segmentDuration, playlistPath, segmentPattern, 'fallback', videoInfo)
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`Attempting encoding strategy ${i + 1}/${strategies.length} for ${bitrate.name}...`);
        return await strategies[i]();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`Strategy ${i + 1} failed for ${bitrate.name}:`, errorMessage);
        if (i === strategies.length - 1) {
          throw new Error(`All encoding strategies failed for ${bitrate.name}. Last error: ${errorMessage}`);
        }
        console.log(`Trying fallback strategy ${i + 2}...`);
      }
    }

    throw new Error(`Unexpected error in generateBitrateSegments for ${bitrate.name}`);
  }

  /**
   * Generate segments with a specific encoding strategy
   */
  private async generateWithStrategy(
    inputPath: string,
    bitrate: BitrateConfig,
    segmentDuration: number,
    playlistPath: string,
    segmentPattern: string,
    strategy: 'optimal' | 'compatible' | 'fallback',
    videoInfo?: any
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const isOriginalQuality = bitrate.name.startsWith('original');
      
      let ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libx264'
      ];

      // Handle audio encoding based on whether audio stream exists
      if (videoInfo?.hasAudio !== false) {
        ffmpegArgs.push('-c:a', 'aac');
      } else {
        ffmpegArgs.push('-an'); // No audio
      }

      // Strategy-specific parameters
      switch (strategy) {
        case 'optimal':
          ffmpegArgs.push(
            '-b:v', bitrate.videoBitrate,
            '-b:a', bitrate.audioBitrate,
            '-maxrate', bitrate.maxrate,
            '-bufsize', bitrate.bufsize
          );

          // Only scale if not original quality
          if (!isOriginalQuality) {
            ffmpegArgs.push('-vf', `scale=${bitrate.resolution}`);
          }

          // Enhanced quality settings
          ffmpegArgs.push(
            '-preset', isOriginalQuality ? 'medium' : 'fast',
            '-crf', isOriginalQuality ? '20' : '23',
            '-profile:v', 'high',
            '-level', '4.1',
            '-pix_fmt', 'yuv420p',
            '-g', '48',
            '-keyint_min', '48',
            '-sc_threshold', '0',
            '-b_strategy', '1',
            '-bf', '3',
            '-refs', '3'
          );
          break;

        case 'compatible':
          // More compatible settings, remove some advanced options
          ffmpegArgs.push(
            '-b:v', bitrate.videoBitrate,
            '-b:a', bitrate.audioBitrate
          );

          if (!isOriginalQuality) {
            ffmpegArgs.push('-vf', `scale=${bitrate.resolution}`);
          }

          ffmpegArgs.push(
            '-preset', 'fast',
            '-crf', '23',
            '-profile:v', 'main', // Use main profile instead of high
            '-level', '3.1', // Lower level for compatibility
            '-pix_fmt', 'yuv420p',
            '-g', '30', // Smaller GOP
            '-keyint_min', '30'
          );
          break;

        case 'fallback':
          // Minimal settings for maximum compatibility
          ffmpegArgs.push(
            '-b:v', bitrate.videoBitrate,
            '-b:a', '128k' // Lower audio bitrate
          );

          if (!isOriginalQuality) {
            ffmpegArgs.push('-vf', `scale=${bitrate.resolution}`);
          }

          ffmpegArgs.push(
            '-preset', 'ultrafast', // Fastest encoding
            '-crf', '28', // Lower quality but more compatible
            '-profile:v', 'baseline', // Most compatible profile
            '-level', '3.0',
            '-pix_fmt', 'yuv420p'
          );
          break;
      }

      // Common HLS settings
      ffmpegArgs.push(
        '-f', 'hls',
        '-hls_time', segmentDuration.toString(),
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', segmentPattern,
        playlistPath
      );

      console.log(`Running FFmpeg (${strategy}) for ${bitrate.name}:`, 'ffmpeg', ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;
        
        // Log FFmpeg progress
        if (output.includes('time=')) {
          process.stdout.write(`\r${bitrate.name} (${strategy}): ${output.match(/time=(\S+)/)?.[1] || ''}`);
        }
      });

      ffmpeg.on('close', (code) => {
        console.log(`\n${bitrate.name} encoding (${strategy}) finished with code ${code}`);
        if (code !== 0) {
          // Include stderr output in error for debugging
          const errorMsg = `FFmpeg failed for ${bitrate.name} (${strategy}) with code ${code}`;
          const detailedError = errorOutput.split('\n').slice(-10).join('\n'); // Last 10 lines
          reject(new Error(`${errorMsg}\nFFmpeg output:\n${detailedError}`));
          return;
        }
        resolve(playlistPath);
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg process error for ${bitrate.name} (${strategy}): ${error.message}`));
      });
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

      // Upload segments in batches for better performance
      const files = await fs.readdir(segmentDir);
      const segmentFiles = files.filter(f => f.endsWith('.ts'));

      await this.uploadSegmentsBatch(segmentFiles, segmentDir, movieId, bitrateName);

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
   * Upload segments in concurrent batches to improve performance
   * Now with smart resume capability - checks existing uploads first
   */
  private async uploadSegmentsBatch(
    segmentFiles: string[],
    segmentDir: string,
    movieId: string,
    bitrateName: string
  ): Promise<void> {
    // Check what's already uploaded to avoid re-uploading
    const existingSegments = await this.getExistingSegments(movieId, bitrateName);
    const segmentsToUpload = segmentFiles.filter(file => !existingSegments.includes(file));
    
    if (segmentsToUpload.length === 0) {
      console.log(`   ✅ All ${segmentFiles.length} segments already uploaded for ${bitrateName}`);
      return;
    }
    
    if (segmentsToUpload.length < segmentFiles.length) {
      const alreadyUploaded = segmentFiles.length - segmentsToUpload.length;
      console.log(`   📤 ${alreadyUploaded} segments already uploaded, uploading ${segmentsToUpload.length} remaining...`);
    }

    const batchSize = 15; // Upload 15 segments concurrently (reduced to prevent Cloudflare connection limits)
    const batches = [];
    
    for (let i = 0; i < segmentsToUpload.length; i += batchSize) {
      batches.push(segmentsToUpload.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        const uploadPromises = batch.map(segmentFile => {
          const segmentPath = path.join(segmentDir, segmentFile);
          return this.uploadFileToR2(
            segmentPath,
            `hls/${movieId}/${bitrateName}/${segmentFile}`,
            'video/mp2t'
          );
        });

        const results = await Promise.all(uploadPromises);
        
        // Count successful uploads and skipped segments
        const successful = results.filter(r => r.success).length;
        const skipped = results.filter(r => r.skipped).length;
        
        if (skipped > 0) {
          console.log(`\n⚠️  Batch ${batchIndex + 1}: ${successful} uploaded, ${skipped} skipped due to persistent failures`);
        }
        
        // Show progress
        const processed = Math.min((batchIndex + 1) * batchSize, segmentsToUpload.length);
        process.stdout.write(`\r   📤 Processed ${processed}/${segmentsToUpload.length} segments...`);
        
      } catch (error) {
        console.error(`\n❌ Batch ${batchIndex + 1} failed, continuing with next batch:`, error);
        // Continue with next batch instead of failing completely
      }
      
      // Small delay between batches to be respectful to Cloudflare
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }
    console.log(''); // New line after progress
  }

  /**
   * Get list of existing segments for a quality from R2
   */
  private async getExistingSegments(movieId: string, bitrateName: string): Promise<string[]> {
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `hls/${movieId}/${bitrateName}/`,
        MaxKeys: 1000 // Should be enough for most movies
      });

      const response = await r2Client().send(command);
      const objects = response.Contents || [];
      
      return objects
        .map(obj => obj.Key || '')
        .filter(key => key.endsWith('.ts'))
        .map(key => path.basename(key));
        
    } catch (error) {
      console.warn(`⚠️  Could not check existing segments for ${bitrateName}:`, error);
      return []; // If we can't check, assume nothing exists and upload all
    }
  }

  /**
   * Upload a single file to R2 with retry logic and skip on persistent failure
   */
  private async uploadFileToR2(
    filePath: string,
    key: string,
    contentType: string
  ): Promise<{ success: boolean; skipped: boolean }> {
    const maxRetries = 5; // Increased to 5 retries
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const fileContent = await fs.readFile(filePath);
        
        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: fileContent,
          ContentType: contentType
        });

        await r2Client().send(command);
        return { success: true, skipped: false }; // Success
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          // Final attempt failed, skip this segment
          console.error(`❌ Skipping ${key} after ${maxRetries} failed attempts: ${lastError.message}`);
          return { success: false, skipped: true };
        }
        
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.warn(`⚠️  Upload attempt ${attempt} failed for ${key}, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return { success: false, skipped: true };
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
    console.log('Usage: tsx hls-segmenter.ts <input-file> <movie-id> [segment-duration] [--include-480p] [--force]');
    console.log('');
    console.log('Options:');
    console.log('  --include-480p    Include 480p quality in addition to original quality');
    console.log('  --force           Overwrite existing HLS files if they exist');
    console.log('');
    console.log('Examples:');
    console.log('  tsx hls-segmenter.ts video.mp4 movie-123                    # Original quality only');
    console.log('  tsx hls-segmenter.ts video.mp4 movie-123 6 --include-480p  # Original + 480p quality');
    console.log('  tsx hls-segmenter.ts video.mp4 movie-123 6 --force         # Force overwrite existing');
    process.exit(1);
  }

  // Parse arguments
  const include480p = args.includes('--include-480p');
  const force = args.includes('--force');
  const filteredArgs = args.filter(arg => arg !== '--include-480p' && arg !== '--force');
  
  const [inputPath, movieId, segmentDurationStr] = filteredArgs;
  const segmentDuration = segmentDurationStr ? parseInt(segmentDurationStr) : 6;

  console.log(`🎬 HLS Segmentation Configuration:`);
  console.log(`   Input: ${inputPath}`);
  console.log(`   Movie ID: ${movieId}`);
  console.log(`   Segment Duration: ${segmentDuration}s`);
  console.log(`   Include 480p: ${include480p ? 'Yes' : 'No'}`);
  console.log(`   Force overwrite: ${force ? 'Yes' : 'No'}`);
  console.log('');

  const segmenter = new HLSSegmenter();
  
  segmenter.segmentVideo({
    inputPath,
    movieId,
    segmentDuration,
    include480p,
    force
  }).then((hlsPath) => {
    console.log(`\nHLS segmentation completed!`);
    console.log(`Master playlist: ${hlsPath}`);
  }).catch((error) => {
    console.error('Segmentation failed:', error);
    process.exit(1);
  });
}

export { HLSSegmenter };
