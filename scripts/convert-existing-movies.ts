#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';
import { HLSSegmenter } from './hls-segmenter';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();

interface ConversionProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
}

class ExistingMovieConverter {
  private progress: ConversionProgress = {
    total: 0,
    completed: 0,
    failed: 0
  };

  /**
   * Convert all existing movies to HLS format
   */
  async convertAllMovies(options: {
    batchSize?: number;
    skipExisting?: boolean;
    deleteOriginal?: boolean;
    include480p?: boolean;
    force?: boolean;
  } = {}): Promise<void> {
    const { batchSize = 5, skipExisting = true, deleteOriginal = false, include480p = false, force = false } = options;

    console.log('🎬 Starting conversion of existing movies to HLS format...\n');

    try {
      // Get all movies that need conversion
      const movies = await this.getMoviesForConversion(skipExisting);
      this.progress.total = movies.length;

      if (movies.length === 0) {
        console.log('✅ No movies need conversion!');
        return;
      }

      console.log(`📊 Found ${movies.length} movies to convert`);
      console.log(`⚙️  Processing in batches of ${batchSize}\n`);

      // Process movies in batches to avoid overwhelming the system
      for (let i = 0; i < movies.length; i += batchSize) {
        const batch = movies.slice(i, i + batchSize);
        
        console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(movies.length / batchSize)}`);
        
        await Promise.allSettled(
          batch.map(movie => this.convertSingleMovie(movie, deleteOriginal, include480p, force))
        );

        // Show progress
        this.showProgress();
        
        // Small delay between batches
        if (i + batchSize < movies.length) {
          console.log('⏳ Waiting 5 seconds before next batch...\n');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      console.log('\n🎉 Conversion process completed!');
      console.log(`✅ Successfully converted: ${this.progress.completed}`);
      console.log(`❌ Failed conversions: ${this.progress.failed}`);

    } catch (error) {
      console.error('💥 Fatal error during conversion:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Convert a single movie by ID
   */
  async convertMovieById(movieId: string, deleteOriginal: boolean = false, include480p: boolean = false, force: boolean = false): Promise<void> {
    console.log(`🎬 Converting movie: ${movieId}`);

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
      console.log(`🔄 Force reconverting "${movie.title}" (--force flag used)`);
    }

    await this.convertSingleMovie(movie, deleteOriginal, include480p, force);
    console.log(`✅ Movie conversion completed: ${movie.title}`);
  }

  /**
   * Get movies that need HLS conversion
   */
  private async getMoviesForConversion(skipExisting: boolean) {
    const whereClause = skipExisting 
      ? {
          // Only movies that need conversion (robust check)
          AND: [
            // Have a valid video path
            { r2_video_path: { not: '' } },
            // AND either no HLS path OR HLS not ready (failed conversion)
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
          // Convert all movies with video paths (force mode)
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
        created_at: 'desc' // Process newest first
      }
    });
  }

  /**
   * Convert a single movie to HLS
   */
  private async convertSingleMovie(movie: any, deleteOriginal: boolean = false, include480p: boolean = false, force: boolean = false): Promise<void> {
    this.progress.current = movie.title;
    
    try {
      console.log(`🔄 Converting: ${movie.title} (${movie.id})`);

      // Download the original video file from R2
      const tempVideoPath = await this.downloadVideoFromR2(movie.r2_video_path, movie.id);

      try {
        // Segment the video using HLS segmenter
        console.log(`📹 [${movie.title}] Starting HLS conversion...`);
        const segmenter = new HLSSegmenter();
        const hlsPath = await segmenter.segmentVideo({
          inputPath: tempVideoPath,
          movieId: movie.id,
          include480p,
          force
        });
        console.log(`🎯 [${movie.title}] HLS conversion completed successfully`);

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

        console.log(`✅ [${movie.title}] Conversion complete -> ${hlsPath}`);
        if (deleteOriginal) {
          console.log(`🗑️  [${movie.title}] Original MP4 deleted`);
        }
        this.progress.completed++;
        
        // Show individual movie completion status
        const processed = this.progress.completed + this.progress.failed;
        console.log(`📈 Overall: ${processed}/${this.progress.total} movies processed (${this.progress.completed} successful, ${this.progress.failed} failed)`);

      } finally {
        // Clean up downloaded file
        await this.cleanupTempFile(tempVideoPath);
      }

    } catch (error) {
      console.error(`❌ [${movie.title}] Conversion failed:`, error);
      this.progress.failed++;
      
      // Show individual movie failure status
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
    // Extract the actual R2 key from the path
    // r2_video_path is stored as "api/movie/filename.mp4"
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
    const tempDir = path.join(os.tmpdir(), 'movie-conversion');
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
      
      // Extract the actual R2 key from the path
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
      // Don't throw - we don't want to fail the conversion if deletion fails
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
      error: error.message,
      stack: error.stack
    };

    const logPath = path.join(process.cwd(), 'conversion-errors.log');
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
    console.log(`📊 Batch Progress: ${processed}/${this.progress.total} (${percentage}%) | ✅ ${this.progress.completed} successful | ❌ ${this.progress.failed} failed`);
    
    if (this.progress.current) {
      console.log(`🎬 Currently processing: ${this.progress.current}`);
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
  const converter = new ExistingMovieConverter();

  async function main() {
    try {
      if (args.includes('--stats')) {
        // Show conversion statistics
        const stats = await converter.getConversionStats();
        console.log('📊 Conversion Statistics:');
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

        await converter.convertMovieById(movieId, deleteOriginal, include480p, force);
        return;
      }

      // Convert all movies
      const batchSize = args.includes('--batch-size') 
        ? parseInt(args[args.indexOf('--batch-size') + 1]) || 5
        : 5;
      
      const force = args.includes('--force');
      const skipExisting = !force;
      const deleteOriginal = args.includes('--delete-original');
      const include480p = args.includes('--include-480p');

      if (deleteOriginal) {
        console.log('⚠️  WARNING: Original MP4 files will be deleted after conversion!');
        console.log('⚠️  This action cannot be undone. Press Ctrl+C to cancel.\n');
        
        // Give user 10 seconds to cancel
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

      await converter.convertAllMovies({
        batchSize,
        skipExisting,
        deleteOriginal,
        include480p,
        force
      });

    } catch (error) {
      console.error('💥 Conversion failed:', error);
      process.exit(1);
    }
  }

  main();
}

export { ExistingMovieConverter };
