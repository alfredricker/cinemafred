#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../../src/lib/r2';
import { GPUHLSSegmenter } from './hls-segmenter-gpu';
import { GPUDetector } from './gpu-detector';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();

interface ConversionProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
  gpuEncoder?: string;
}

class GPUMovieConverter {
  private progress: ConversionProgress = {
    total: 0,
    completed: 0,
    failed: 0
  };
  private gpuDetector: GPUDetector;

  constructor() {
    this.gpuDetector = new GPUDetector();
  }

  /**
   * Convert all existing movies to HLS format using GPU acceleration
   */
  async convertAllMovies(options: {
    batchSize?: number;
    skipExisting?: boolean;
    deleteOriginal?: boolean;
    include480p?: boolean;
    force?: boolean;
    forceGPU?: string;
  } = {}): Promise<void> {
    const { 
      batchSize = 3, // Smaller batch size for GPU to avoid memory issues
      skipExisting = true, 
      deleteOriginal = false, 
      include480p = false, 
      force = false,
      forceGPU
    } = options;

    console.log('🚀 Starting GPU-accelerated conversion of existing movies to HLS format...\n');

    try {
      // Initialize GPU detection
      console.log('🔍 Detecting GPU capabilities...');
      const gpuCapabilities = await this.gpuDetector.detectCapabilities();
      
      // Determine encoder
      const encoder = forceGPU || gpuCapabilities.recommendedEncoder;
      this.progress.gpuEncoder = encoder;
      
      if (encoder === 'libx264') {
        console.log('⚠️  No GPU acceleration available, falling back to CPU encoding');
        console.log('💡 Consider installing GPU drivers for faster conversion');
      } else {
        console.log(`🚀 Using GPU encoder: ${encoder}`);
        
        // Test the encoder
        const testResult = await this.gpuDetector.testEncoder(encoder);
        if (!testResult) {
          console.log('❌ GPU encoder test failed, falling back to CPU encoding');
          this.progress.gpuEncoder = 'libx264';
        }
      }

      // Get all movies that need conversion
      const movies = await this.getMoviesForConversion(skipExisting);
      this.progress.total = movies.length;

      if (movies.length === 0) {
        console.log('✅ No movies need conversion!');
        return;
      }

      console.log(`📊 Found ${movies.length} movies to convert`);
      console.log(`⚙️  Processing in batches of ${batchSize} (GPU-optimized)`);
      console.log(`🎯 Using encoder: ${this.progress.gpuEncoder}\n`);

      // Process movies in smaller batches for GPU
      for (let i = 0; i < movies.length; i += batchSize) {
        const batch = movies.slice(i, i + batchSize);
        
        console.log(`🔄 Processing GPU batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(movies.length / batchSize)}`);
        
        // Process batch sequentially for GPU to avoid memory conflicts
        for (const movie of batch) {
          await this.convertSingleMovie(movie, deleteOriginal, include480p, force, this.progress.gpuEncoder);
        }

        // Show progress
        this.showProgress();
        
        // Longer delay between batches for GPU memory cleanup
        if (i + batchSize < movies.length) {
          console.log('⏳ Waiting 10 seconds for GPU memory cleanup...\n');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      console.log('\n🎉 GPU-accelerated conversion process completed!');
      console.log(`✅ Successfully converted: ${this.progress.completed}`);
      console.log(`❌ Failed conversions: ${this.progress.failed}`);
      
      if (this.progress.gpuEncoder !== 'libx264') {
        console.log(`🚀 GPU acceleration provided significant speed improvements with ${this.progress.gpuEncoder}`);
      }

    } catch (error) {
      console.error('💥 Fatal error during GPU conversion:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Convert a single movie by ID using GPU acceleration
   */
  async convertMovieById(
    movieId: string, 
    deleteOriginal: boolean = false, 
    include480p: boolean = false, 
    force: boolean = false,
    forceGPU?: string
  ): Promise<void> {
    console.log(`🎬 Converting movie with GPU acceleration: ${movieId}`);

    // Initialize GPU detection
    const gpuCapabilities = await this.gpuDetector.detectCapabilities();
    const encoder = forceGPU || gpuCapabilities.recommendedEncoder;
    
    console.log(`🚀 Using encoder: ${encoder}`);
    
    if (encoder !== 'libx264') {
      const testResult = await this.gpuDetector.testEncoder(encoder);
      if (!testResult) {
        throw new Error(`GPU encoder ${encoder} test failed. Try --force-gpu libx264 for CPU encoding.`);
      }
    }

    const movie = await prisma.movie.findUnique({
      where: { id: movieId }
    });

    if (!movie) {
      throw new Error(`Movie not found: ${movieId}`);
    }

    // Check if HLS already exists
    if (movie.r2_hls_path && !force) {
      throw new Error(`Movie "${movie.title}" already has HLS conversion (${movie.r2_hls_path}). Use --force flag to reconvert.`);
    }

    if (force && movie.r2_hls_path) {
      console.log(`🔄 Force reconverting "${movie.title}" with GPU acceleration`);
    }

    await this.convertSingleMovie(movie, deleteOriginal, include480p, force, encoder);
    console.log(`✅ GPU-accelerated movie conversion completed: ${movie.title}`);
  }

  /**
   * Get movies that need HLS conversion
   */
  private async getMoviesForConversion(skipExisting: boolean) {
    const whereClause = skipExisting 
      ? {
          AND: [
            { r2_video_path: { not: '' } },
            {
              OR: [
                { r2_hls_path: null },
                { r2_hls_path: '' },
                { hls_ready: false }
              ]
            }
          ]
        }
      : {
          r2_video_path: { not: '' }
        };

    return await prisma.movie.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        r2_hls_path: true,
        hls_ready: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });
  }

  /**
   * Convert a single movie to HLS using GPU acceleration
   */
  private async convertSingleMovie(
    movie: any, 
    deleteOriginal: boolean = false, 
    include480p: boolean = false, 
    force: boolean = false,
    encoder: string = 'libx264'
  ): Promise<void> {
    this.progress.current = movie.title;
    
    try {
      console.log(`🔄 GPU Converting: ${movie.title} (${movie.id}) with ${encoder}`);

      // Download the original video file from R2
      const tempVideoPath = await this.downloadVideoFromR2(movie.r2_video_path, movie.id);

      try {
        // Segment the video using GPU HLS segmenter
        console.log(`📹 [${movie.title}] Starting GPU-accelerated HLS conversion...`);
        const segmenter = new GPUHLSSegmenter();
        
        const hlsPath = await segmenter.segmentVideo({
          inputPath: tempVideoPath,
          movieId: movie.id,
          include480p,
          force,
          forceGPU: encoder !== 'libx264' ? encoder : undefined
        });
        
        console.log(`🎯 [${movie.title}] GPU HLS conversion completed successfully`);

        // Update database with HLS path
        await prisma.movie.update({
          where: { id: movie.id },
          data: { 
            r2_hls_path: hlsPath,
            hls_ready: true
          }
        });

        // Delete original MP4 if requested
        if (deleteOriginal) {
          await this.deleteOriginalFromR2(movie.r2_video_path, movie.title);
        }

        console.log(`✅ [${movie.title}] GPU conversion complete -> ${hlsPath}`);
        if (deleteOriginal) {
          console.log(`🗑️  [${movie.title}] Original MP4 deleted`);
        }
        this.progress.completed++;
        
        const processed = this.progress.completed + this.progress.failed;
        console.log(`📈 Overall: ${processed}/${this.progress.total} movies processed (${this.progress.completed} successful, ${this.progress.failed} failed)`);

      } finally {
        // Clean up downloaded file
        await this.cleanupTempFile(tempVideoPath);
      }

    } catch (error) {
      console.error(`❌ [${movie.title}] GPU conversion failed:`, error);
      this.progress.failed++;
      
      const processed = this.progress.completed + this.progress.failed;
      console.log(`📈 Overall: ${processed}/${this.progress.total} movies processed (${this.progress.completed} successful, ${this.progress.failed} failed)`);
      
      // Log the error to a file for later review
      await this.logError(movie, error);
    }
  }

  /**
   * Download video file from R2 to local temp file
   */
  private async downloadVideoFromR2(r2VideoPath: string, movieId: string): Promise<string> {
    const r2Key = r2VideoPath.replace('api/movie/', '');
    
    console.log(`📥 Downloading ${r2Key} from R2...`);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key
    });

    const response = await r2Client().send(command);
    
    if (!response.Body) {
      throw new Error('No video data received from R2');
    }

    // Create temp file
    const tempDir = path.join(os.tmpdir(), 'gpu-movie-conversion');
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempFilePath = path.join(tempDir, `${movieId}.mp4`);
    
    // Stream the video data to temp file
    const chunks: Buffer[] = [];
    const stream = response.Body as any;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const videoBuffer = Buffer.concat(chunks);
    await fs.writeFile(tempFilePath, videoBuffer);
    
    console.log(`📁 Downloaded to: ${tempFilePath} (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    return tempFilePath;
  }

  /**
   * Delete original MP4 file from R2 storage
   */
  private async deleteOriginalFromR2(r2VideoPath: string, movieTitle: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      
      const r2Key = r2VideoPath.replace('api/movie/', '');
      
      console.log(`🗑️  Deleting original MP4: ${r2Key}`);

      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key
      });

      await r2Client().send(command);
      console.log(`✅ Original MP4 deleted successfully for: ${movieTitle}`);
      
    } catch (error) {
      console.error(`❌ Failed to delete original MP4 for ${movieTitle}:`, error);
    }
  }

  /**
   * Clean up temporary video file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      console.log(`🗑️  Cleaned up: ${path.basename(filePath)}`);
    } catch (error) {
      console.warn(`⚠️  Failed to cleanup ${filePath}:`, error);
    }
  }

  /**
   * Log conversion errors to file
   */
  private async logError(movie: any, error: any): Promise<void> {
    const errorLog = {
      timestamp: new Date().toISOString(),
      movieId: movie.id,
      movieTitle: movie.title,
      videoPath: movie.r2_video_path,
      gpuEncoder: this.progress.gpuEncoder,
      error: error.message,
      stack: error.stack
    };

    const logPath = path.join(process.cwd(), 'gpu-conversion-errors.log');
    const logEntry = JSON.stringify(errorLog) + '\n';
    
    try {
      await fs.appendFile(logPath, logEntry);
    } catch (logError) {
      console.error('Failed to write error log:', logError);
    }
  }

  /**
   * Show conversion progress
   */
  private showProgress(): void {
    const processed = this.progress.completed + this.progress.failed;
    const percentage = (processed / this.progress.total * 100).toFixed(1);
    console.log(`📊 GPU Batch Progress: ${processed}/${this.progress.total} (${percentage}%) | ✅ ${this.progress.completed} successful | ❌ ${this.progress.failed} failed`);
    
    if (this.progress.current) {
      console.log(`🎬 Currently processing: ${this.progress.current}`);
    }
    
    if (this.progress.gpuEncoder) {
      console.log(`🚀 Using encoder: ${this.progress.gpuEncoder}`);
    }
  }

  /**
   * Get conversion statistics
   */
  async getConversionStats(): Promise<{
    total: number;
    converted: number;
    needsConversion: number;
  }> {
    const [total, converted] = await Promise.all([
      prisma.movie.count({
        where: { r2_video_path: { not: '' } }
      }),
      prisma.movie.count({
        where: { 
          r2_video_path: { not: '' },
          hls_ready: true
        }
      })
    ]);

    return {
      total,
      converted,
      needsConversion: total - converted
    };
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const converter = new GPUMovieConverter();

  async function main() {
    try {
      if (args.includes('--stats')) {
        // Show conversion statistics
        const stats = await converter.getConversionStats();
        console.log('📊 GPU Conversion Statistics:');
        console.log(`   Total movies: ${stats.total}`);
        console.log(`   Already converted: ${stats.converted}`);
        console.log(`   Need conversion: ${stats.needsConversion}`);
        return;
      }

      if (args.includes('--movie-id')) {
        // Convert specific movie
        const movieIdIndex = args.indexOf('--movie-id') + 1;
        const movieId = args[movieIdIndex];
        
        if (!movieId) {
          console.error('❌ Movie ID is required when using --movie-id');
          process.exit(1);
        }

        const deleteOriginal = args.includes('--delete-original');
        const include480p = args.includes('--include-480p');
        const force = args.includes('--force');
        const gpuIndex = args.indexOf('--force-gpu');
        const forceGPU = gpuIndex !== -1 ? args[gpuIndex + 1] : undefined;
        
        if (deleteOriginal) {
          console.log('⚠️  WARNING: Original MP4 will be deleted after conversion!');
        }
        
        if (include480p) {
          console.log('📺 Including 480p quality in addition to original quality');
        } else {
          console.log('📺 Converting to original quality only (use --include-480p to add 480p)');
        }

        if (force) {
          console.log('🔄 Force mode enabled - will reconvert even if HLS already exists');
        }

        if (forceGPU) {
          console.log(`🚀 Force using GPU encoder: ${forceGPU}`);
        }

        await converter.convertMovieById(movieId, deleteOriginal, include480p, force, forceGPU);
        return;
      }

      // Convert all movies
      const batchSize = args.includes('--batch-size') 
        ? parseInt(args[args.indexOf('--batch-size') + 1]) || 3
        : 3; // Smaller default for GPU
      
      const force = args.includes('--force');
      const skipExisting = !force;
      const deleteOriginal = args.includes('--delete-original');
      const include480p = args.includes('--include-480p');
      const gpuIndex = args.indexOf('--force-gpu');
      const forceGPU = gpuIndex !== -1 ? args[gpuIndex + 1] : undefined;

      if (deleteOriginal) {
        console.log('⚠️  WARNING: Original MP4 files will be deleted after conversion!');
        console.log('⚠️  This action cannot be undone. Press Ctrl+C to cancel.\n');
        
        for (let i = 10; i > 0; i--) {
          process.stdout.write(`\rStarting in ${i} seconds... `);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('\n');
      }

      if (include480p) {
        console.log('📺 Including 480p quality in addition to original quality');
      } else {
        console.log('📺 Converting to original quality only (use --include-480p to add 480p)');
      }

      if (forceGPU) {
        console.log(`🚀 Force using GPU encoder: ${forceGPU}`);
      }

      await converter.convertAllMovies({
        batchSize,
        skipExisting,
        deleteOriginal,
        include480p,
        force,
        forceGPU
      });

    } catch (error) {
      console.error('💥 GPU conversion failed:', error);
      process.exit(1);
    }
  }

  main();
}

export { GPUMovieConverter };

// Export the convertMovieToHLS function for compatibility
export async function convertMovieToHLS(options: {
  movieId: string;
  force?: boolean;
  keepOriginal?: boolean;
  include480p?: boolean;
  forceGPU?: string;
}): Promise<void> {
  const converter = new GPUMovieConverter();
  await converter.convertMovieById(
    options.movieId,
    !options.keepOriginal,
    options.include480p || false,
    options.force || false,
    options.forceGPU
  );
}
