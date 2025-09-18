import { HLSSegmenter } from '../../scripts/hls-segmenter';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../lib/r2';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { promises as fs } from 'fs';
import path from 'path';
import { withDatabase } from '../lib/db';
import { logCriticalError } from './container-lifecycle';

/**
 * Strip API prefix from database paths to get actual R2 path
 */
function stripApiPrefix(path: string): string {
  // Remove 'api/movie/' prefix that exists in database but not in R2
  return path.replace(/^api\/movie\//, '');
}

// Download video from R2 to local temp file
export async function downloadVideoFromR2(r2VideoPath: string, movieId: string): Promise<string> {
  // Strip API prefix to get actual R2 path
  const actualR2Path = stripApiPrefix(r2VideoPath);
  console.log(`📥 Downloading from R2: ${r2VideoPath} -> ${actualR2Path}`);
  
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: actualR2Path
  });

  const response = await r2Client.send(command);
  
  if (!response.Body) {
    throw new Error('No video data received from R2');
  }

  // Create temp file path
  const tempDir = '/tmp/uploads';
  const tempFileName = `${movieId}-${Date.now()}.mp4`;
  const tempFilePath = path.join(tempDir, tempFileName);

  // Stream the video data to temp file
  const readableStream = response.Body as Readable;
  const writeStream = require('fs').createWriteStream(tempFilePath);
  
  await pipeline(readableStream, writeStream);
  
  return tempFilePath;
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

// Send webhook notification
export async function sendWebhook(webhookUrl: string, data: any): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    console.log(`✅ Webhook sent successfully: ${data.status}`);
  } catch (error) {
    console.error('Failed to send webhook:', error);
  }
}

// Process uploaded video file
export async function processUploadedVideo(
  movieId: string,
  videoPath: string,
  webhookUrl: string,
  startTime: number
) {
  try {
    console.log(`🔄 Processing uploaded video: ${movieId}`);
    
    // Convert to HLS
    const segmenter = new HLSSegmenter();
    const hlsPath = await segmenter.segmentVideo({
      inputPath: videoPath,
      movieId: movieId
    });

    // Update database with HLS path
    console.log(`🔄 Updating database for uploaded movie: ${movieId}`);
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

    const processingTime = Date.now() - startTime;
    console.log(`✅ Upload conversion completed: ${movieId} (${(processingTime / 1000).toFixed(1)}s)`);

    // Send success webhook
    await sendWebhook(webhookUrl, {
      movieId,
      status: 'completed',
      hlsPath,
      processingTime,
      type: 'upload'
    });

    // Trigger container shutdown after successful conversion
    console.log(`🛑 Conversion completed successfully - initiating container shutdown...`);
    setTimeout(() => {
      const { gracefulShutdown } = require('./container-lifecycle');
      gracefulShutdown('Conversion job completed successfully');
    }, 5000); // Give webhook time to send

  } catch (error) {
    logCriticalError(error, `Upload conversion for ${movieId}`);
    
    // Send failure webhook
    await sendWebhook(webhookUrl, {
      movieId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: Date.now() - startTime,
      type: 'upload'
    });
  } finally {
    // Cleanup uploaded file
    try {
      await fs.unlink(videoPath);
      console.log(`🧹 Cleaned up uploaded file: ${videoPath}`);
    } catch (cleanupError) {
      console.error('Failed to cleanup uploaded file:', cleanupError);
    }
  }
}

// Process existing video from R2
export async function processExistingVideo(
  movieId: string,
  webhookUrl: string,
  deleteOriginal: boolean,
  startTime: number
) {
  let tempVideoPath: string | null = null;
  
  try {
    // Get movie from database
    const movie = await withDatabase(async (db) => {
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

    if (!movie || !movie.r2_video_path) {
      throw new Error('Movie or video file not found');
    }

    console.log(`📥 Downloading existing video: ${movie.title}`);
    
    // Download from R2
    tempVideoPath = await downloadVideoFromR2(movie.r2_video_path, movieId);
    
    console.log(`🔄 Converting existing video: ${movie.title}`);
    
    // Convert to HLS
    const segmenter = new HLSSegmenter();
    const hlsPath = await segmenter.segmentVideo({
      inputPath: tempVideoPath,
      movieId: movieId
    });

    // Update database with HLS path
    console.log(`🔄 Updating database for: ${movie.title}`);
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

    // Delete original MP4 if requested
    if (deleteOriginal) {
      await deleteOriginalFromR2(movie.r2_video_path, movie.title);
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Existing conversion completed: ${movie.title} (${(processingTime / 1000).toFixed(1)}s)`);

    // Send success webhook
    await sendWebhook(webhookUrl, {
      movieId,
      title: movie.title,
      status: 'completed',
      hlsPath,
      processingTime,
      originalDeleted: deleteOriginal,
      type: 'existing'
    });

    // Trigger container shutdown after successful conversion
    console.log(`🛑 Conversion completed successfully - initiating container shutdown...`);
    setTimeout(() => {
      const { gracefulShutdown } = require('./container-lifecycle');
      gracefulShutdown('Conversion job completed successfully');
    }, 5000); // Give webhook time to send

  } catch (error) {
    logCriticalError(error, `Existing conversion for ${movieId}`);
    
    // Send failure webhook
    await sendWebhook(webhookUrl, {
      movieId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: Date.now() - startTime,
      type: 'existing'
    });
  } finally {
    // Cleanup temp file
    if (tempVideoPath) {
      try {
        await fs.unlink(tempVideoPath);
        console.log(`🧹 Cleaned up temp file: ${tempVideoPath}`);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
  }
}
