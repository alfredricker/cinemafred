#!/usr/bin/env node

import express from 'express';
import multer from 'multer';
import { HLSSegmenter } from '../../scripts/hls-segmenter';
import { prisma } from '../lib/prisma';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../lib/r2';
import { promises as fs } from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8080;

// Configure multer for file uploads (temp storage in container)
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB max file size
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

// Middleware
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'ffmpeg-converter',
    version: '1.0.0'
  });
});

// Convert uploaded file endpoint (for new uploads)
app.post('/convert/upload', upload.single('video'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const { movieId, webhookUrl } = req.body;
    
    if (!movieId || !webhookUrl) {
      return res.status(400).json({ error: 'movieId and webhookUrl are required' });
    }

    console.log(`🎬 Converting uploaded file for movie: ${movieId}`);
    
    // Respond immediately
    res.json({
      message: 'Conversion started',
      movieId,
      uploadedFile: req.file.originalname
    });

    // Process in background
    processUploadedVideo(req.file.path, movieId, webhookUrl, startTime);

  } catch (error) {
    console.error('Upload conversion error:', error);
    res.status(500).json({
      error: 'Failed to start conversion',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Convert existing MP4 from R2 endpoint
app.post('/convert/existing', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { movieId, webhookUrl, deleteOriginal = false } = req.body;
    
    if (!movieId || !webhookUrl) {
      return res.status(400).json({ error: 'movieId and webhookUrl are required' });
    }

    console.log(`🎬 Converting existing MP4 for movie: ${movieId}`);
    
    // Respond immediately
    res.json({
      message: 'Conversion started',
      movieId
    });

    // Process in background
    processExistingVideo(movieId, webhookUrl, deleteOriginal, startTime);

  } catch (error) {
    console.error('Existing conversion error:', error);
    res.status(500).json({
      error: 'Failed to start conversion',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Process uploaded video file (new uploads)
 */
async function processUploadedVideo(
  videoPath: string,
  movieId: string,
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

    // Update database
    await prisma.movie.update({
      where: { id: movieId },
      data: {
        r2_hls_path: hlsPath,
        hls_ready: true,
        updated_at: new Date()
      }
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

  } catch (error) {
    console.error(`❌ Upload conversion failed: ${movieId}`, error);
    
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

/**
 * Process existing video from R2
 */
async function processExistingVideo(
  movieId: string,
  webhookUrl: string,
  deleteOriginal: boolean,
  startTime: number
) {
  let tempVideoPath: string | null = null;
  
  try {
    // Get movie from database
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        hls_ready: true
      }
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

  } catch (error) {
    console.error(`❌ Existing conversion failed: ${movieId}`, error);
    
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

/**
 * Download video file from R2 to temp file
 */
async function downloadVideoFromR2(r2VideoPath: string, movieId: string): Promise<string> {
  const r2Key = r2VideoPath.replace('api/movie/', '');
  
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: r2Key
  });

  const response = await r2Client.send(command);
  
  if (!response.Body) {
    throw new Error('No video data received from R2');
  }

  const tempFilePath = `/tmp/${movieId}.mp4`;
  
  // Stream the video data to temp file
  const chunks: Buffer[] = [];
  const stream = response.Body as any;
  
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  const videoBuffer = Buffer.concat(chunks);
  await fs.writeFile(tempFilePath, videoBuffer);
  
  console.log(`📁 Downloaded: ${tempFilePath} (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  
  return tempFilePath;
}

/**
 * Delete original MP4 file from R2
 */
async function deleteOriginalFromR2(r2VideoPath: string, movieTitle: string): Promise<void> {
  try {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const r2Key = r2VideoPath.replace('api/movie/', '');
    
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key
    });
    
    await r2Client.send(command);
    console.log(`🗑️ Deleted original MP4: ${movieTitle}`);
  } catch (error) {
    console.error(`Failed to delete original MP4 for ${movieTitle}:`, error);
  }
}

/**
 * Send webhook notification
 */
async function sendWebhook(webhookUrl: string, data: any): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      console.error(`Webhook failed: ${response.status} ${response.statusText}`);
    } else {
      console.log(`📡 Webhook sent: ${data.status}`);
    }
  } catch (error) {
    console.error('Failed to send webhook:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FFmpeg Converter running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📤 Upload: http://localhost:${PORT}/convert/upload`);
  console.log(`🔄 Existing: http://localhost:${PORT}/convert/existing`);
});

export default app;