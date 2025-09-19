import { HLSSegmenter } from '../../scripts/hls-segmenter';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../lib/r2';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { promises as fs } from 'fs';
import path from 'path';
import { withDatabase } from '../lib/db';
import { logCriticalError, startJob, endJob } from './container-lifecycle';

/**
 * Strip API prefix from database paths to get actual R2 path
 */
function stripApiPrefix(path: string): string {
  // Remove 'api/movie/' prefix that exists in database but not in R2
  return path.replace(/^api\/movie\//, '');
}

// Download video from R2 to local temp file with retry logic
export async function downloadVideoFromR2(r2VideoPath: string, movieId: string): Promise<string> {
  const downloadStartTime = Date.now();
  const maxRetries = 3;
  
  // Strip API prefix to get actual R2 path
  const actualR2Path = stripApiPrefix(r2VideoPath);
  console.log(`📥 [STEP 1/4] Downloading video from R2`);
  console.log(`   Source: ${r2VideoPath} -> ${actualR2Path}`);
  console.log(`   Movie ID: ${movieId}`);
  
  // Create temp file path
  const tempDir = '/tmp/uploads';
  await require('fs').promises.mkdir(tempDir, { recursive: true });
  const tempFileName = `${movieId}-${Date.now()}.mp4`;
  const tempFilePath = path.join(tempDir, tempFileName);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxRetries}...`);
      
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: actualR2Path
      });

      const response = await r2Client.send(command);
      
      if (!response.Body) {
        throw new Error('No video data received from R2');
      }

      console.log(`   Temp file: ${tempFilePath}`);
      console.log(`   Content length: ${response.ContentLength ? `${(response.ContentLength / 1024 / 1024).toFixed(1)} MB` : 'unknown'}`);

      // Stream the video data to temp file with progress tracking
      const readableStream = response.Body as Readable;
      const writeStream = require('fs').createWriteStream(tempFilePath);
      
      let downloadedBytes = 0;
      const totalBytes = response.ContentLength || 0;
      let lastProgressLog = Date.now();
      
      readableStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        
        // Log progress every 30 seconds for large files
        if (now - lastProgressLog > 30000 && totalBytes > 0) {
          const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          const speed = (downloadedBytes / 1024 / 1024) / ((now - downloadStartTime) / 1000);
          const eta = totalBytes > 0 ? ((totalBytes - downloadedBytes) / (downloadedBytes / ((now - downloadStartTime) / 1000))) / 60 : 0;
          console.log(`   📊 Progress: ${progress}% (${speed.toFixed(1)} MB/s, ETA: ${eta.toFixed(1)}min)`);
          lastProgressLog = now;
        }
      });
      
      // Add error handling for stream interruption
      readableStream.on('error', (error: any) => {
        console.error(`   ❌ Download stream error: ${error.message}`);
        throw error;
      });
      
      writeStream.on('error', (error: any) => {
        console.error(`   ❌ Write stream error: ${error.message}`);
        throw error;
      });
      
      await pipeline(readableStream, writeStream);
      
      const downloadTime = Date.now() - downloadStartTime;
      console.log(`✅ Download completed in ${(downloadTime / 1000).toFixed(1)}s`);
      
      return tempFilePath;
      
    } catch (error: any) {
      console.error(`❌ Download attempt ${attempt} failed:`, error.message);
      
      // Clean up partial file
      try {
        await require('fs').promises.unlink(tempFilePath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      if (attempt === maxRetries) {
        throw new Error(`Download failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`   ⏳ Retrying in ${waitTime / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error('Download failed - should not reach here');
}

// Delete original video from R2
export async function deleteOriginalFromR2(r2VideoPath: string, movieTitle: string): Promise<void> {
  // Strip API prefix to get actual R2 path
  const actualR2Path = stripApiPrefix(r2VideoPath);
  console.log(`🗑️ Deleting original video: ${movieTitle} (${r2VideoPath} -> ${actualR2Path})`);
  
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: actualR2Path
  });

  await r2Client.send(command);
  console.log(`✅ Original video deleted: ${movieTitle}`);
}

// Send webhook notification with retry logic
export async function sendWebhook(webhookUrl: string, data: any): Promise<void> {
  const maxRetries = 3;
  
  console.log(`📡 Sending webhook to: ${webhookUrl}`);
  console.log(`📦 Webhook data:`, JSON.stringify(data, null, 2));
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Webhook attempt ${attempt}/${maxRetries}...`);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CinemaFred-Converter/1.0',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      console.log(`   Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const responseText = await response.text();
        console.error(`   Response body: ${responseText}`);
        throw new Error(`Webhook failed: ${response.status} ${response.statusText} - ${responseText}`);
      }

      const responseData = await response.json();
      console.log(`✅ Webhook sent successfully:`, responseData);
      return; // Success, exit retry loop
      
    } catch (error: any) {
      console.error(`❌ Webhook attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`💥 Webhook failed after ${maxRetries} attempts - continuing without webhook`);
        return; // Don't throw, just log and continue
      }
      
      // Wait before retry
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`   ⏳ Retrying webhook in ${waitTime / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Note: Upload processing removed - Cloud Run Jobs focus on existing video conversion
// For new uploads, videos should be uploaded to R2 first, then processed as "existing" videos

// Process existing video from R2
export async function processExistingVideo(
  movieId: string,
  webhookUrl: string,
  deleteOriginal: boolean,
  startTime: number
) {
  let tempVideoPath: string | null = null;
  
  // Track this job
  startJob(`existing-${movieId}`);
  
  try {
    console.log(`🔌 Connecting to database to fetch movie details...`);
    
    // Get movie from database
    const movie = await withDatabase(async (db) => {
      console.log(`📊 Querying database for movie: ${movieId}`);
      return await db.movie.findUnique({
        where: { id: movieId },
        select: {
          id: true,
          title: true,
          r2_video_path: true,
          hls_ready: true
        }
      });
    });

    console.log(`✅ Database query completed`);

    if (!movie || !movie.r2_video_path) {
      throw new Error('Movie or video file not found');
    }

    console.log(`🎬 Processing existing video: "${movie.title}"`);
    console.log(`📋 Job ID: existing-${movieId}`);
    console.log(`📁 Video path: ${movie.r2_video_path}`);
    
    // Step 1: Download from R2
    tempVideoPath = await downloadVideoFromR2(movie.r2_video_path, movieId);
    
    // Step 2: Convert to HLS
    console.log(`🔄 [STEP 2/4] Converting to HLS format`);
    console.log(`   Input: ${tempVideoPath}`);
    console.log(`   Output structure: hls/${movieId}/`);
    
    const conversionStartTime = Date.now();
    const segmenter = new HLSSegmenter();
    const hlsPath = await segmenter.segmentVideo({
      inputPath: tempVideoPath,
      movieId: movieId,
      include480p: false // Default to original quality only for Cloud Run jobs
    });
    const conversionTime = Date.now() - conversionStartTime;
    console.log(`✅ HLS conversion completed in ${(conversionTime / 1000).toFixed(1)}s`);

    // Step 3: Update database
    console.log(`📊 [STEP 3/4] Updating database`);
    console.log(`   Movie: ${movie.title}`);
    console.log(`   HLS path: ${hlsPath}`);
    
    await withDatabase(async (db) => {
      await db.movie.update({
        where: { id: movieId },
        data: {
          r2_hls_path: hlsPath,
          hls_ready: true,
          updated_at: new Date()
        }
      });
    });
    console.log(`✅ Database updated successfully`);

    // Step 4: Optional cleanup and completion
    console.log(`🧹 [STEP 4/4] Finalizing conversion`);
    
    if (deleteOriginal) {
      console.log(`   Deleting original MP4 file...`);
      await deleteOriginalFromR2(movie.r2_video_path, movie.title);
      console.log(`   ✅ Original file deleted`);
    } else {
      console.log(`   ✅ Original file preserved`);
    }

    const processingTime = Date.now() - startTime;
    console.log(`🎉 CONVERSION COMPLETE: "${movie.title}"`);
    console.log(`   Total time: ${(processingTime / 1000).toFixed(1)}s`);
    console.log(`   HLS path: ${hlsPath}`);
    console.log(`   Quality levels: Original + ${movie.title.includes('480p') ? '480p' : 'auto-detected'}`);
    console.log(`   Folder structure: hls/${movieId}/[quality]/`);

    // Send success webhook
    console.log(`📡 Sending completion webhook...`);
    await sendWebhook(webhookUrl, {
      movieId,
      title: movie.title,
      status: 'completed',
      hlsPath,
      processingTime,
      originalDeleted: deleteOriginal,
      type: 'existing'
    });
    console.log(`✅ Webhook sent successfully`);

    // End job tracking on success
    endJob(`existing-${movieId}`);
    
    // Cleanup temp file on success
    if (tempVideoPath) {
      try {
        await fs.unlink(tempVideoPath);
        console.log(`🧹 Cleaned up temp file: ${tempVideoPath}`);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }

    // Log completion but don't shutdown - let Cloud Run manage lifecycle
    console.log(`🏁 Job completed successfully - container ready for next job`);
    console.log(`📊 Container will remain available for additional conversions`);
    // Note: Cloud Run will automatically scale down when idle

  } catch (error) {
    console.error(`💥 CONVERSION FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
    logCriticalError(error, `Existing conversion for ${movieId}`);
    
    // Send failure webhook
    await sendWebhook(webhookUrl, {
      movieId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: Date.now() - startTime,
      type: 'existing'
    });
    
    // End job tracking on error
    endJob(`existing-${movieId}`);
    
    // Cleanup temp file on error
    if (tempVideoPath) {
      try {
        await fs.unlink(tempVideoPath);
        console.log(`🧹 Cleaned up temp file after error: ${tempVideoPath}`);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
    
    // Re-throw the error so it's not silently ignored
    throw error;
    
  } finally {
    // Final cleanup - this runs regardless of success/failure
    // Job tracking is handled in success/error blocks above
    console.log(`🔚 Processing finished for ${movieId}`);
  }
}
