#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../../src/lib/r2';
import { GPUDetector, GPUCapabilities } from './gpu-detector';

interface SegmentationOptions {
  inputPath: string;
  movieId: string;
  outputDir?: string;
  segmentDuration?: number;
  bitrates?: BitrateConfig[];
  include480p?: boolean;
  forceGPU?: string; // Force specific GPU encoder
}

interface BitrateConfig {
  name: string;
  videoBitrate: string;
  audioBitrate: string;
  resolution: string;
  maxrate: string;
  bufsize: string;
}

interface GPUEncoderConfig {
  encoder: string;
  preset: string;
  profile: string;
  level: string;
  additionalArgs: string[];
}

// GPU-optimized bitrate configurations
const DEFAULT_BITRATES: BitrateConfig[] = [
  {
    name: '480p',
    videoBitrate: '1400k',
    audioBitrate: '128k',
    resolution: '854x480',
    maxrate: '1498k',
    bufsize: '2100k'
  }
];

class GPUHLSSegmenter {
  private tempDir: string;
  private gpuCapabilities: GPUCapabilities | null = null;
  private gpuDetector: GPUDetector;

  constructor() {
    this.tempDir = '';
    this.gpuDetector = new GPUDetector();
  }

  /**
   * Initialize GPU detection
   */
  async initialize(): Promise<void> {
    this.gpuCapabilities = await this.gpuDetector.detectCapabilities();
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
   * Main segmentation function with GPU acceleration
   */
  async segmentVideo(options: SegmentationOptions & { force?: boolean }): Promise<string> {
    const {
      inputPath,
      movieId,
      outputDir = os.tmpdir(),
      segmentDuration = 6,
      bitrates = DEFAULT_BITRATES,
      include480p = false,
      force = false,
      forceGPU
    } = options;

    console.log(`🎬 Starting GPU-accelerated HLS segmentation for movie: ${movieId}`);
    console.log(`📁 Input: ${inputPath}`);

    // Initialize GPU detection if not done already
    if (!this.gpuCapabilities) {
      await this.initialize();
    }

    // Determine encoder to use
    const encoder = this.determineEncoder(forceGPU);
    console.log(`🚀 Using encoder: ${encoder}`);

    // Check if HLS already exists
    const hlsExists = await this.checkHLSExists(movieId);
    if (hlsExists && !force) {
      throw new Error(`HLS files already exist for movie ${movieId}. Use --force flag to overwrite.`);
    }

    if (force && hlsExists) {
      console.log(`🔄 Force mode enabled - overwriting existing HLS files`);
    }

    console.log(`⏱️  GPU acceleration should significantly reduce conversion time...`);

    // Create temporary directory
    this.tempDir = path.join(outputDir, `hls_gpu_${movieId}_${Date.now()}`);
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
      
      // Generate segments for each bitrate using GPU
      console.log(`⚙️  [STEP 2C/4] Processing video segments with ${encoder}...`);
      const playlistPaths: string[] = [];
      
      for (let i = 0; i < bitrateConfigs.length; i++) {
        const bitrate = bitrateConfigs[i];
        console.log(`   Processing ${bitrate.name} (${i + 1}/${bitrateConfigs.length}) with GPU...`);
        const segmentStartTime = Date.now();
        
        const playlistPath = await this.generateGPUBitrateSegments(
          inputPath,
          bitrate,
          segmentDuration,
          movieId,
          encoder,
          videoInfo
        );
        
        const segmentTime = Date.now() - segmentStartTime;
        console.log(`   ✅ ${bitrate.name} completed in ${(segmentTime / 1000).toFixed(1)}s (GPU-accelerated)`);
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

      console.log(`✅ GPU-accelerated HLS segmentation completed for movie: ${movieId}`);
      console.log(`📁 Final structure: hls/${movieId}/playlist.m3u8`);
      return `hls/${movieId}/playlist.m3u8`;

    } finally {
      // Cleanup temporary files
      await this.cleanup();
    }
  }

  /**
   * Determine which encoder to use
   */
  private determineEncoder(forceGPU?: string): string {
    if (forceGPU) {
      console.log(`🔧 Force using encoder: ${forceGPU}`);
      return forceGPU;
    }

    if (!this.gpuCapabilities) {
      console.log('⚠️  GPU capabilities not detected, using CPU encoder');
      return 'libx264';
    }

    return this.gpuCapabilities.recommendedEncoder;
  }

  /**
   * Get GPU encoder configuration
   */
  private getGPUEncoderConfig(encoder: string): GPUEncoderConfig {
    const configs: Record<string, GPUEncoderConfig> = {
      'h264_nvenc': {
        encoder: 'h264_nvenc',
        preset: 'p3', // Balanced preset (p1=fastest, p7=slowest)
        profile: 'high',
        level: '4.1',
        additionalArgs: [
          '-rc', 'vbr', // Variable bitrate
          '-cq', '20',  // Constant quality (lower = better quality)
          '-b_ref_mode', 'middle', // B-frame reference mode
          '-temporal-aq', '1', // Temporal adaptive quantization
          '-rc-lookahead', '20', // Rate control lookahead
          '-surfaces', '64', // More surfaces for better performance
          '-forced-idr', '1', // Force IDR frames
          '-gpu', '0' // Use first GPU
        ]
      },
      'h264_qsv': {
        encoder: 'h264_qsv',
        preset: 'medium',
        profile: 'high',
        level: '4.1',
        additionalArgs: [
          '-look_ahead', '1',
          '-look_ahead_depth', '40',
          '-global_quality', '20',
          '-rdo', '1',
          '-mbbrc', '1', // Macroblock level bitrate control
          '-extbrc', '1', // Extended bitrate control
          '-adaptive_i', '1',
          '-adaptive_b', '1'
        ]
      },
      'h264_vaapi': {
        encoder: 'h264_vaapi',
        preset: 'medium',
        profile: 'high',
        level: '4.1',
        additionalArgs: [
          '-vaapi_device', '/dev/dri/renderD128',
          '-quality', '20',
          '-rc_mode', 'VBR',
          '-compression_level', '2'
        ]
      },
      'libx264': {
        encoder: 'libx264',
        preset: 'medium',
        profile: 'high',
        level: '4.1',
        additionalArgs: [
          '-crf', '20',
          '-bf', '3',
          '-refs', '3'
        ]
      }
    };

    return configs[encoder] || configs['libx264'];
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
   * Parse frame rate from FFprobe format
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
   * Create bitrate configurations
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
    }

    // Always add original quality with better bitrate calculation
    const originalQualityName = this.getQualityName(height);
    const originalBitrate = Math.max(sourceBitrate || 0, 2000000);
    
    // Use higher quality for GPU encoding - we can afford it with faster encoding
    const targetBitrate = Math.floor(originalBitrate * 0.98 / 1000); // 98% of source bitrate
    const maxBitrate = Math.floor(originalBitrate * 1.2 / 1000); // Allow 120% for peaks
    const bufferSize = Math.floor(originalBitrate * 2.0 / 1000); // Larger buffer for GPU
    
    console.log(`📊 GPU-optimized encoding parameters:`);
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
   * Generate segments for a specific bitrate using GPU acceleration
   */
  private async generateGPUBitrateSegments(
    inputPath: string,
    bitrate: BitrateConfig,
    segmentDuration: number,
    movieId: string,
    encoder: string,
    videoInfo?: any
  ): Promise<string> {
    const outputDir = path.join(this.tempDir, bitrate.name);
    await fs.mkdir(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');

    return new Promise((resolve, reject) => {
      const isOriginalQuality = bitrate.name.startsWith('original');
      const encoderConfig = this.getGPUEncoderConfig(encoder);
      
      let ffmpegArgs = ['-i', inputPath];

      // GPU-specific input arguments
      if (encoder === 'h264_vaapi') {
        ffmpegArgs.unshift('-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi');
      } else if (encoder === 'h264_qsv') {
        ffmpegArgs.unshift('-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv');
      } else if (encoder === 'h264_nvenc') {
        ffmpegArgs.unshift('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
      }

      // Video encoding
      ffmpegArgs.push('-c:v', encoderConfig.encoder);

      // Handle audio encoding
      if (videoInfo?.hasAudio !== false) {
        ffmpegArgs.push('-c:a', 'aac');
        ffmpegArgs.push('-b:a', bitrate.audioBitrate);
      } else {
        ffmpegArgs.push('-an');
      }

      // Bitrate settings
      ffmpegArgs.push('-b:v', bitrate.videoBitrate);
      ffmpegArgs.push('-maxrate', bitrate.maxrate);
      ffmpegArgs.push('-bufsize', bitrate.bufsize);

      // Scaling (only if not original quality)
      if (!isOriginalQuality) {
        if (encoder === 'h264_vaapi') {
          ffmpegArgs.push('-vf', `scale_vaapi=${bitrate.resolution}`);
        } else if (encoder === 'h264_qsv') {
          ffmpegArgs.push('-vf', `scale_qsv=${bitrate.resolution}`);
        } else if (encoder === 'h264_nvenc') {
          ffmpegArgs.push('-vf', `scale_cuda=${bitrate.resolution}`);
        } else {
          ffmpegArgs.push('-vf', `scale=${bitrate.resolution}`);
        }
      }

      // Encoder-specific settings
      if (encoder !== 'libx264') {
        ffmpegArgs.push('-preset', encoderConfig.preset);
      }
      
      ffmpegArgs.push('-profile:v', encoderConfig.profile);
      ffmpegArgs.push('-level', encoderConfig.level);

      // Add encoder-specific additional arguments
      ffmpegArgs.push(...encoderConfig.additionalArgs);

      // Pixel format
      if (encoder === 'h264_vaapi') {
        ffmpegArgs.push('-pix_fmt', 'vaapi_vld');
      } else if (encoder === 'h264_qsv') {
        ffmpegArgs.push('-pix_fmt', 'qsv');
      } else if (encoder === 'h264_nvenc') {
        ffmpegArgs.push('-pix_fmt', 'cuda');
      } else {
        ffmpegArgs.push('-pix_fmt', 'yuv420p');
      }

      // GOP settings
      ffmpegArgs.push('-g', '48');
      ffmpegArgs.push('-keyint_min', '48');
      ffmpegArgs.push('-sc_threshold', '0');

      // HLS settings
      ffmpegArgs.push(
        '-f', 'hls',
        '-hls_time', segmentDuration.toString(),
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', segmentPattern,
        playlistPath
      );

      console.log(`Running GPU FFmpeg for ${bitrate.name}:`, 'ffmpeg', ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;
        
        // Log FFmpeg progress
        if (output.includes('time=')) {
          process.stdout.write(`\r${bitrate.name} (GPU): ${output.match(/time=(\S+)/)?.[1] || ''}`);
        }
      });

      ffmpeg.on('close', async (code) => {
        console.log(`\n${bitrate.name} GPU encoding finished with code ${code}`);
        
        if (code !== 0) {
          // Check if files were created despite error code
          try {
            const playlistExists = await fs.access(playlistPath).then(() => true).catch(() => false);
            const segmentFiles = await fs.readdir(path.dirname(segmentPattern)).catch(() => []);
            const segmentCount = segmentFiles.filter(f => f.startsWith('segment_') && f.endsWith('.ts')).length;
            
            if (playlistExists && segmentCount > 0) {
              console.log(`⚠️  FFmpeg exited with code ${code} but files were created successfully (${segmentCount} segments)`);
              resolve(playlistPath);
              return;
            }
          } catch (checkError) {
            console.log(`Could not verify output files: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
          
          const errorMsg = `GPU FFmpeg failed for ${bitrate.name} with code ${code}`;
          const detailedError = errorOutput.split('\n').slice(-10).join('\n');
          reject(new Error(`${errorMsg}\nFFmpeg output:\n${detailedError}`));
          return;
        }
        
        resolve(playlistPath);
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`GPU FFmpeg process error for ${bitrate.name}: ${error.message}`));
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

      // Upload segments
      const files = await fs.readdir(segmentDir);
      const segmentFiles = files.filter(f => f.endsWith('.ts'));

      await this.uploadSegmentsBatch(segmentFiles, segmentDir, movieId, bitrateName);

      totalSegments += segmentFiles.length;
      console.log(`   ✅ ${bitrateName}: ${segmentFiles.length} segments uploaded`);
    }

    console.log(`✅ Upload complete: ${totalSegments} total segments + ${bitratePlaylistPaths.length + 1} playlists`);
  }

  /**
   * Upload segments in concurrent batches
   */
  private async uploadSegmentsBatch(
    segmentFiles: string[],
    segmentDir: string,
    movieId: string,
    bitrateName: string
  ): Promise<void> {
    const batchSize = 10; // Reduced batch size to prevent R2 rate limiting
    const batches = [];
    
    for (let i = 0; i < segmentFiles.length; i += batchSize) {
      batches.push(segmentFiles.slice(i, i + batchSize));
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

        await Promise.all(uploadPromises);
        
        const processed = Math.min((batchIndex + 1) * batchSize, segmentFiles.length);
        process.stdout.write(`\r   📤 Processed ${processed}/${segmentFiles.length} segments...`);
        
      } catch (error) {
        console.error(`\n❌ Batch ${batchIndex + 1} failed:`, error);
      }
      
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay to prevent R2 rate limiting
      }
    }
    console.log('');
  }

  /**
   * Upload a single file to R2 with retry logic for rate limiting
   */
  private async uploadFileToR2(
    filePath: string,
    key: string,
    contentType: string
  ): Promise<{ success: boolean; skipped: boolean }> {
    const maxRetries = 3;
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
        return { success: true, skipped: false };
        
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's an R2 rate limiting or XML parsing error
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isR2Error = errorMessage.includes('char \'&\' is not expected') || 
                         errorMessage.includes('Deserialization error') ||
                         errorMessage.includes('TooManyRequests');
        
        if (isR2Error && attempt < maxRetries) {
          // Exponential backoff for R2 errors: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          console.warn(`⚠️  R2 rate limit hit for ${key}, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        if (attempt === maxRetries) {
          console.error(`❌ Failed to upload ${key} after ${maxRetries} attempts:`, errorMessage);
          return { success: false, skipped: true };
        }
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
        console.log('GPU conversion temporary files cleaned up');
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
    console.log('Usage: tsx hls-segmenter-gpu.ts <input-file> <movie-id> [segment-duration] [options]');
    console.log('');
    console.log('Options:');
    console.log('  --include-480p       Include 480p quality in addition to original quality');
    console.log('  --force              Overwrite existing HLS files if they exist');
    console.log('  --gpu <encoder>      Force specific GPU encoder (h264_nvenc, h264_qsv, h264_vaapi)');
    console.log('');
    console.log('Examples:');
    console.log('  tsx hls-segmenter-gpu.ts video.mp4 movie-123                           # Auto-detect GPU');
    console.log('  tsx hls-segmenter-gpu.ts video.mp4 movie-123 6 --include-480p         # Original + 480p');
    console.log('  tsx hls-segmenter-gpu.ts video.mp4 movie-123 6 --gpu h264_nvenc       # Force NVIDIA');
    console.log('  tsx hls-segmenter-gpu.ts video.mp4 movie-123 6 --gpu h264_qsv         # Force Intel QSV');
    console.log('  tsx hls-segmenter-gpu.ts video.mp4 movie-123 6 --gpu h264_vaapi       # Force VAAPI');
    process.exit(1);
  }

  // Parse arguments
  const include480p = args.includes('--include-480p');
  const force = args.includes('--force');
  const gpuIndex = args.indexOf('--gpu');
  const forceGPU = gpuIndex !== -1 ? args[gpuIndex + 1] : undefined;
  
  const filteredArgs = args.filter((arg, index) => 
    arg !== '--include-480p' && 
    arg !== '--force' && 
    arg !== '--gpu' && 
    (gpuIndex === -1 || index !== gpuIndex + 1)
  );
  
  const [inputPath, movieId, segmentDurationStr] = filteredArgs;
  const segmentDuration = segmentDurationStr ? parseInt(segmentDurationStr) : 6;

  console.log(`🎬 GPU-Accelerated HLS Segmentation Configuration:`);
  console.log(`   Input: ${inputPath}`);
  console.log(`   Movie ID: ${movieId}`);
  console.log(`   Segment Duration: ${segmentDuration}s`);
  console.log(`   Include 480p: ${include480p ? 'Yes' : 'No'}`);
  console.log(`   Force overwrite: ${force ? 'Yes' : 'No'}`);
  if (forceGPU) {
    console.log(`   Force GPU encoder: ${forceGPU}`);
  }
  console.log('');

  const segmenter = new GPUHLSSegmenter();
  
  segmenter.segmentVideo({
    inputPath,
    movieId,
    segmentDuration,
    include480p,
    force,
    forceGPU
  }).then((hlsPath) => {
    console.log(`\n🚀 GPU-accelerated HLS segmentation completed!`);
    console.log(`Master playlist: ${hlsPath}`);
  }).catch((error) => {
    console.error('GPU segmentation failed:', error);
    process.exit(1);
  });
}

export { GPUHLSSegmenter };
