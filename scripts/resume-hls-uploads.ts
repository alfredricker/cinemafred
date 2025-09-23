#!/usr/bin/env tsx

/**
 * Resume HLS Upload Script
 * 
 * This script resumes failed HLS uploads by checking what's already uploaded to R2
 * and only uploading the missing segments and playlists.
 * 
 * Usage:
 *   npm run resume-uploads -- <movie-id>
 *   npm run resume-uploads -- --all
 *   tsx scripts/resume-hls-uploads.ts <movie-id>
 */

import { PrismaClient } from '@prisma/client';
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();

interface UploadStatus {
  movieId: string;
  title: string;
  localHLSPath: string;
  r2HLSPath: string;
  qualities: QualityUploadStatus[];
  masterPlaylistExists: boolean;
  needsUpload: boolean;
}

interface QualityUploadStatus {
  quality: string;
  localSegments: string[];
  uploadedSegments: string[];
  missingSegments: string[];
  playlistExists: boolean;
  localPath: string;
}

class HLSUploadResumer {
  
  /**
   * Resume uploads for a specific movie
   */
  async resumeMovieUploads(movieId: string): Promise<void> {
    console.log(`🔍 Checking upload status for movie: ${movieId}`);
    
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true, title: true, r2_hls_path: true, hls_ready: true }
    });

    if (!movie) {
      console.log(`❌ Movie not found: ${movieId}`);
      return;
    }

    console.log(`📽️  Processing: ${movie.title}`);
    
    // Find local HLS files (they should be in temp directory or conversion output)
    const localHLSPath = await this.findLocalHLSFiles(movieId);
    
    if (!localHLSPath) {
      console.log(`❌ No local HLS files found for ${movie.title}`);
      console.log(`   You may need to re-run the conversion process`);
      return;
    }

    console.log(`📁 Found local HLS files at: ${localHLSPath}`);
    
    // Generate the expected HLS path (even if not set in database yet)
    const expectedHLSPath = `hls/${movieId}/playlist.m3u8`;
    
    // Get upload status
    const status = await this.getUploadStatus(movieId, movie.title, localHLSPath, expectedHLSPath);
    
    if (!status.needsUpload) {
      console.log(`✅ All files already uploaded for: ${movie.title}`);
      
      // Update database with HLS path and mark as ready
      await prisma.movie.update({
        where: { id: movieId },
        data: { 
          r2_hls_path: expectedHLSPath,
          hls_ready: true 
        }
      });
      console.log(`📝 Updated database: set HLS path and marked ${movie.title} as ready`);
      return;
    }

    // Resume uploads
    await this.resumeUploads(status);
    
    // Update database with HLS path and mark as complete
    await prisma.movie.update({
      where: { id: movieId },
      data: { 
        r2_hls_path: expectedHLSPath,
        hls_ready: true 
      }
    });
    
    console.log(`📝 Updated database: set HLS path to ${expectedHLSPath}`);
    console.log(`✅ Resume complete for: ${movie.title}`);
  }

  /**
   * Resume uploads for all movies that need it
   */
  async resumeAllUploads(): Promise<void> {
    console.log(`🔍 Finding movies with incomplete uploads...`);
    
    // Find movies that either:
    // 1. Have HLS path but not ready (failed upload)
    // 2. Don't have HLS path but might have temp files (crashed before DB update)
    const movies = await prisma.movie.findMany({
      where: {
        AND: [
          { r2_video_path: { not: '' } }, // Must have original video
          {
            OR: [
              // Case 1: Has HLS path but not ready (failed upload)
              {
                AND: [
                  { r2_hls_path: { not: null } },
                  { r2_hls_path: { not: '' } },
                  { hls_ready: false }
                ]
              },
              // Case 2: No HLS path at all (crashed before DB update)
              {
                OR: [
                  { r2_hls_path: null },
                  { r2_hls_path: '' }
                ]
              }
            ]
          }
        ]
      },
      select: { id: true, title: true, r2_hls_path: true, hls_ready: true }
    });

    if (movies.length === 0) {
      console.log(`✅ No movies found that might need upload resume`);
      return;
    }

    console.log(`📋 Found ${movies.length} movies that might need upload resume:`);
    movies.forEach((movie, i) => {
      const status = movie.r2_hls_path ? 
        (movie.hls_ready ? '✅ Ready' : '⏳ Incomplete') : 
        '❓ No HLS path';
      console.log(`   ${i + 1}. ${movie.title} (${status})`);
    });
    console.log('');

    let resumedCount = 0;
    for (const movie of movies) {
      try {
        // Check if this movie actually has temp files before trying to resume
        const localHLSPath = await this.findLocalHLSFiles(movie.id);
        if (localHLSPath) {
          console.log(`🔄 Resuming: ${movie.title}`);
          await this.resumeMovieUploads(movie.id);
          resumedCount++;
        } else {
          console.log(`⏭️  Skipping ${movie.title}: No local HLS files found`);
        }
        console.log(''); // Empty line between movies
      } catch (error) {
        console.error(`❌ Failed to resume uploads for ${movie.title}:`, error);
      }
    }
    
    console.log(`📊 Resume summary: ${resumedCount} movies processed`);
  }

  /**
   * Find local HLS files for a movie
   */
  private async findLocalHLSFiles(movieId: string): Promise<string | null> {
    const searchDirs = [
      '/tmp',
      os.tmpdir(),
      path.join(process.cwd(), 'temp')
    ];

    // Search for directories matching the pattern: hls_{movieId}_{timestamp}
    for (const searchDir of searchDirs) {
      try {
        const items = await fs.readdir(searchDir);
        
        // Look for directories that start with hls_{movieId}_
        const matchingDirs = items.filter(item => 
          item.startsWith(`hls_${movieId}_`) && 
          item.match(/^hls_[a-f0-9-]{36}_\d+$/)
        );
        
        // Sort by timestamp (newest first) and try each one
        const sortedDirs = matchingDirs.sort((a, b) => {
          const timestampA = parseInt(a.split('_')[2]);
          const timestampB = parseInt(b.split('_')[2]);
          return timestampB - timestampA; // Newest first
        });
        
        for (const dirName of sortedDirs) {
          const fullPath = path.join(searchDir, dirName);
          try {
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
              // Check if it contains HLS files
              const files = await fs.readdir(fullPath);
              if (files.some(f => f.endsWith('.m3u8'))) {
                console.log(`📁 Found HLS directory: ${fullPath}`);
                return fullPath;
              }
            }
          } catch (error) {
            // Directory might be inaccessible, continue
            continue;
          }
        }
      } catch (error) {
        // Search directory doesn't exist or is inaccessible, continue
        continue;
      }
    }

    return null;
  }

  /**
   * Get detailed upload status for a movie
   */
  private async getUploadStatus(
    movieId: string, 
    title: string, 
    localHLSPath: string, 
    r2HLSPath: string
  ): Promise<UploadStatus> {
    
    // Get uploaded files from R2
    const uploadedFiles = await this.getUploadedFiles(movieId);
    
    // Get local files
    const localFiles = await this.getLocalFiles(localHLSPath);
    
    // Check master playlist
    const masterPlaylistExists = uploadedFiles.includes('playlist.m3u8');
    
    // Analyze each quality
    const qualities: QualityUploadStatus[] = [];
    let needsUpload = !masterPlaylistExists;
    
    for (const quality of localFiles.qualities) {
      const uploadedSegments = uploadedFiles.filter(f => 
        f.startsWith(`${quality.name}/`) && f.endsWith('.ts')
      ).map(f => path.basename(f));
      
      const playlistExists = uploadedFiles.includes(`${quality.name}/playlist.m3u8`);
      
      const missingSegments = quality.segments.filter(seg => 
        !uploadedSegments.includes(seg)
      );
      
      console.log(`   📊 ${quality.name}: ${quality.segments.length} local, ${uploadedSegments.length} uploaded, ${missingSegments.length} missing`);
      
      if (missingSegments.length > 0 || !playlistExists) {
        needsUpload = true;
      }
      
      qualities.push({
        quality: quality.name,
        localSegments: quality.segments,
        uploadedSegments,
        missingSegments,
        playlistExists,
        localPath: quality.path
      });
    }

    return {
      movieId,
      title,
      localHLSPath,
      r2HLSPath,
      qualities,
      masterPlaylistExists,
      needsUpload
    };
  }

  /**
   * Get list of uploaded files from R2 (with pagination support)
   */
  private async getUploadedFiles(movieId: string): Promise<string[]> {
    const allFiles: string[] = [];
    let continuationToken: string | undefined;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `hls/${movieId}/`,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      });

      const response = await r2Client().send(command);
      const objects = response.Contents || [];
      
      const files = objects
        .map(obj => obj.Key || '')
        .filter(key => key.startsWith(`hls/${movieId}/`))
        .map(key => key.replace(`hls/${movieId}/`, ''));
      
      allFiles.push(...files);
      continuationToken = response.NextContinuationToken;
      
    } while (continuationToken);
    
    console.log(`📊 Found ${allFiles.length} existing files in R2 for movie ${movieId}`);
    const segments = allFiles.filter(f => f.endsWith('.ts'));
    console.log(`   📦 ${segments.length} segments already uploaded`);
    
    return allFiles;
  }

  /**
   * Get local HLS files structure
   */
  private async getLocalFiles(localHLSPath: string): Promise<{
    masterPlaylist: string;
    qualities: Array<{ name: string; path: string; segments: string[] }>;
  }> {
    const masterPlaylist = path.join(localHLSPath, 'playlist.m3u8');
    const qualities = [];
    
    const items = await fs.readdir(localHLSPath);
    
    for (const item of items) {
      const itemPath = path.join(localHLSPath, item);
      const stat = await fs.stat(itemPath);
      
      if (stat.isDirectory()) {
        // This is a quality directory
        const files = await fs.readdir(itemPath);
        const segments = files.filter(f => f.endsWith('.ts')).sort();
        
        qualities.push({
          name: item,
          path: itemPath,
          segments
        });
      }
    }
    
    return { masterPlaylist, qualities };
  }

  /**
   * Resume uploads based on status
   */
  private async resumeUploads(status: UploadStatus): Promise<void> {
    console.log(`📤 Resuming uploads for: ${status.title}`);
    
    // Upload master playlist if missing
    if (!status.masterPlaylistExists) {
      console.log(`   📄 Uploading master playlist...`);
      const masterPlaylistPath = path.join(status.localHLSPath, 'playlist.m3u8');
      await this.uploadFile(
        masterPlaylistPath,
        `hls/${status.movieId}/playlist.m3u8`,
        'application/vnd.apple.mpegurl'
      );
    }

    // Upload missing files for each quality
    for (const quality of status.qualities) {
      console.log(`   📁 Processing ${quality.quality}...`);
      
      // Upload playlist if missing
      if (!quality.playlistExists) {
        console.log(`      📄 Uploading ${quality.quality} playlist...`);
        const playlistPath = path.join(quality.localPath, 'playlist.m3u8');
        await this.uploadFile(
          playlistPath,
          `hls/${status.movieId}/${quality.quality}/playlist.m3u8`,
          'application/vnd.apple.mpegurl'
        );
      }
      
      // Upload missing segments
      if (quality.missingSegments.length > 0) {
        console.log(`      📦 Uploading ${quality.missingSegments.length} missing segments...`);
        await this.uploadSegmentsBatch(
          quality.missingSegments,
          quality.localPath,
          status.movieId,
          quality.quality
        );
      } else {
        console.log(`      ✅ All ${quality.localSegments.length} segments already uploaded`);
      }
    }
    
    console.log(`✅ Upload resume complete for: ${status.title}`);
  }

  /**
   * Upload segments in batches (reusing the optimized batch logic)
   */
  private async uploadSegmentsBatch(
    segmentFiles: string[],
    segmentDir: string,
    movieId: string,
    bitrateName: string
  ): Promise<void> {
    const batchSize = 15; // Upload 15 segments concurrently (reduced to prevent Cloudflare connection limits)
    const batches = [];
    
    for (let i = 0; i < segmentFiles.length; i += batchSize) {
      batches.push(segmentFiles.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        const uploadPromises = batch.map(segmentFile => {
          const segmentPath = path.join(segmentDir, segmentFile);
          return this.uploadFile(
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
        const processed = Math.min((batchIndex + 1) * batchSize, segmentFiles.length);
        process.stdout.write(`\r      📤 Processed ${processed}/${segmentFiles.length} segments...`);
        
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
   * Upload a single file to R2 with retry logic and skip on persistent failure
   */
  private async uploadFile(
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
   * Show detailed status for a movie
   */
  async showUploadStatus(movieId: string): Promise<void> {
    console.log(`🔍 Checking upload status for movie: ${movieId}`);
    
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true, title: true, r2_hls_path: true, hls_ready: true }
    });

    if (!movie) {
      console.log(`❌ Movie not found: ${movieId}`);
      return;
    }

    console.log(`📽️  Movie: ${movie.title}`);
    console.log(`📁 HLS Path: ${movie.r2_hls_path || 'Not set'}`);
    console.log(`✅ HLS Ready: ${movie.hls_ready ? 'Yes' : 'No'}`);
    
    if (!movie.r2_hls_path) {
      console.log(`⚠️  No HLS path set - conversion may not have started`);
      return;
    }

    // Check what's uploaded
    const uploadedFiles = await this.getUploadedFiles(movieId);
    console.log(`📊 Uploaded files: ${uploadedFiles.length}`);
    
    // Group by quality
    const qualities = new Set<string>();
    uploadedFiles.forEach(file => {
      const parts = file.split('/');
      if (parts.length >= 2 && parts[0] !== 'playlist.m3u8') {
        qualities.add(parts[0]);
      }
    });
    
    console.log(`📺 Qualities found: ${Array.from(qualities).join(', ') || 'None'}`);
    
    // Check master playlist
    const hasMasterPlaylist = uploadedFiles.includes('playlist.m3u8');
    console.log(`📄 Master playlist: ${hasMasterPlaylist ? '✅ Exists' : '❌ Missing'}`);
    
    // Check each quality
    for (const quality of qualities) {
      const segments = uploadedFiles.filter(f => f.startsWith(`${quality}/`) && f.endsWith('.ts'));
      const hasPlaylist = uploadedFiles.includes(`${quality}/playlist.m3u8`);
      console.log(`   ${quality}: ${segments.length} segments, playlist: ${hasPlaylist ? '✅' : '❌'}`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const resumer = new HLSUploadResumer();

  async function main() {
    try {
      if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🎬 HLS Upload Resume Script

Usage:
  tsx scripts/resume-hls-uploads.ts <movie-id>     Resume uploads for specific movie
  tsx scripts/resume-hls-uploads.ts --all          Resume uploads for all incomplete movies
  tsx scripts/resume-hls-uploads.ts --status <id>  Show upload status for movie

Examples:
  tsx scripts/resume-hls-uploads.ts abc123-def456-ghi789
  tsx scripts/resume-hls-uploads.ts --all
  tsx scripts/resume-hls-uploads.ts --status abc123-def456-ghi789

NPM Scripts:
  npm run resume-uploads -- <movie-id>
  npm run resume-uploads -- --all
  npm run resume-uploads -- --status <movie-id>
        `);
        return;
      }

      if (args.includes('--status')) {
        const movieId = args[args.indexOf('--status') + 1];
        if (!movieId) {
          console.error('❌ Movie ID required for --status');
          process.exit(1);
        }
        await resumer.showUploadStatus(movieId);
        return;
      }

      if (args.includes('--all')) {
        await resumer.resumeAllUploads();
        return;
      }

      // Resume specific movie
      const movieId = args[0];
      if (!movieId) {
        console.error('❌ Please provide a movie ID or use --all');
        console.log('Usage: tsx scripts/resume-hls-uploads.ts <movie-id>');
        process.exit(1);
      }

      await resumer.resumeMovieUploads(movieId);

    } catch (error) {
      console.error('💥 Resume failed:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  main();
}

export { HLSUploadResumer };
