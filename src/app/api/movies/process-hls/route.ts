// src/app/api/movies/process-hls/route.ts
import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/middleware';
import { HLSSegmenter } from '../../../../../scripts/hls-segmenter';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: Request) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { movieId, forceReprocess = false, deleteOriginal = false } = await request.json();

    if (!movieId) {
      return NextResponse.json({ error: 'Movie ID is required' }, { status: 400 });
    }

    // Get movie from database
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        r2_hls_path: true,
        hls_ready: true
      }
    });

    if (!movie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
    }

    if (!movie.r2_video_path) {
      return NextResponse.json({ error: 'Movie has no video file' }, { status: 400 });
    }

    // Check if already processed and not forcing reprocess
    if (movie.hls_ready && movie.r2_hls_path && !forceReprocess) {
      return NextResponse.json({ 
        message: 'Movie already has HLS segments',
        hlsPath: movie.r2_hls_path,
        alreadyProcessed: true
      });
    }

    console.log(`Starting HLS processing for movie: ${movie.title} (${movieId})`);

    // Download video file from R2
    const tempVideoPath = await downloadVideoFromR2(movie.r2_video_path, movieId);

    try {
      // Process with HLS segmenter
      const segmenter = new HLSSegmenter();
      const hlsPath = await segmenter.segmentVideo({
        inputPath: tempVideoPath,
        movieId: movieId
      });

      // Update database
      await prisma.movie.update({
        where: { id: movieId },
        data: {
          r2_hls_path: hlsPath,
          hls_ready: true,
          updated_at: new Date()
        }
      });

      // Delete original MP4 if requested
      if (deleteOriginal) {
        await deleteOriginalFromR2(movie.r2_video_path, movie.title);
      }

      console.log(`HLS processing completed for movie: ${movie.title}`);

      return NextResponse.json({
        message: 'HLS processing completed successfully',
        movieId,
        hlsPath,
        title: movie.title
      });

    } finally {
      // Clean up downloaded file
      await cleanupTempFile(tempVideoPath);
    }

  } catch (error) {
    console.error('HLS processing error:', error);
    
    // Update database to mark as failed
    try {
      const { movieId } = await request.json();
      if (movieId) {
        await prisma.movie.update({
          where: { id: movieId },
          data: { hls_ready: false }
        });
      }
    } catch (dbError) {
      console.error('Failed to update movie status:', dbError);
    }

    return NextResponse.json(
      { 
        error: 'HLS processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Download video file from R2 to local temp file
 */
async function downloadVideoFromR2(r2VideoPath: string, movieId: string): Promise<string> {
  // Extract the actual R2 key from the path
  const r2Key = r2VideoPath.replace('api/movie/', '');
  
  console.log(`Downloading ${r2Key} from R2 for HLS processing...`);

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: r2Key
  });

  const response = await r2Client.send(command);
  
  if (!response.Body) {
    throw new Error('No video data received from R2');
  }

  // Create temp file
  const tempDir = path.join(os.tmpdir(), 'hls-processing');
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
  
  console.log(`Downloaded to temp file: ${tempFilePath} (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  
  return tempFilePath;
}

/**
 * Delete original MP4 file from R2 storage
 */
async function deleteOriginalFromR2(r2VideoPath: string, movieTitle: string): Promise<void> {
  try {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    
    // Extract the actual R2 key from the path
    const r2Key = r2VideoPath.replace('api/movie/', '');
    
    console.log(`Deleting original MP4: ${r2Key}`);

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key
    });

    await r2Client.send(command);
    console.log(`Original MP4 deleted successfully for: ${movieTitle}`);
    
  } catch (error) {
    console.error(`Failed to delete original MP4 for ${movieTitle}:`, error);
    // Don't throw - we don't want to fail the conversion if deletion fails
  }
}

/**
 * Clean up temporary video file
 */
async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    console.log(`Cleaned up temp file: ${path.basename(filePath)}`);
  } catch (error) {
    console.warn(`Failed to cleanup ${filePath}:`, error);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
