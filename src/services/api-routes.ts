import express from 'express';
import multer from 'multer';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../lib/r2';
import prisma, { ensureDbConnection, getDatabaseDiagnostics, cleanAllConnections, getConnectionStatus } from '../lib/db';
import { getContainerHealth } from './container-lifecycle';
import { processUploadedVideo, processExistingVideo } from './video-processing';

// Configure multer for file uploads (temp storage in container)
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit
  },
});

export function setupRoutes(app: express.Application) {
  // Middleware
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    const healthInfo = getContainerHealth();
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'ffmpeg-converter',
      version: '1.0.0',
      ...healthInfo
    });
  });

  // Database connection test endpoint
  app.get('/test-db', async (req, res) => {
    try {
      console.log('🔍 Testing database connection...');
      
      // Test basic connection
      await ensureDbConnection();
      console.log('✅ Database connected successfully');
      
      // Test a simple query
      const movieCount = await prisma.movie.count();
      console.log(`📊 Found ${movieCount} movies in database`);
      
      // Test finding movies that need conversion
      const moviesNeedingConversion = await prisma.movie.count({
        where: { hls_ready: false }
      });
      console.log(`🎬 ${moviesNeedingConversion} movies need HLS conversion`);
      
      // Get a sample movie
      const sampleMovie = await prisma.movie.findFirst({
        where: { hls_ready: false },
        select: { id: true, title: true, r2_video_path: true }
      });
      
      res.json({
        status: 'success',
        database: 'connected',
        timestamp: new Date().toISOString(),
        stats: {
          totalMovies: movieCount,
          needingConversion: moviesNeedingConversion,
          sampleMovie: sampleMovie
        }
      });
      
    } catch (error) {
      console.error('❌ Database test failed:', error);
      res.status(500).json({
        status: 'error',
        database: 'failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // R2 connection test endpoint
  app.get('/test-r2', async (req, res) => {
    try {
      console.log('🔍 Testing R2 connection...');
      
      // Test R2 connection by listing objects (just first few)
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        MaxKeys: 5
      });
      
      const response = await r2Client.send(command);
      console.log(`✅ R2 connected successfully. Found ${response.KeyCount || 0} objects`);
      
      res.json({
        status: 'success',
        r2: 'connected',
        timestamp: new Date().toISOString(),
        bucket: BUCKET_NAME,
        objectCount: response.KeyCount || 0,
        sampleObjects: response.Contents?.map(obj => obj.Key).slice(0, 3) || []
      });
      
    } catch (error) {
      console.error('❌ R2 test failed:', error);
      res.status(500).json({
        status: 'error',
        r2: 'failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Database connection diagnostics endpoint
  app.get('/db-diagnostics', async (req, res) => {
    try {
      console.log('🔍 Running database diagnostics...');
      
      const diagnostics = await getDatabaseDiagnostics();
      console.log('✅ Database diagnostics completed');
      
      res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        ...diagnostics
      });
      
    } catch (error) {
      console.error('❌ Database diagnostics failed:', error);
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clean all database connections endpoint
  app.post('/db-clean', async (req, res) => {
    try {
      console.log('🧹 Cleaning all database connections...');
      
      const beforeStatus = await getConnectionStatus();
      await cleanAllConnections();
      const afterStatus = await getConnectionStatus();
      
      console.log('✅ Database connections cleaned');
      
      res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        before: beforeStatus,
        after: afterStatus,
        message: 'All database connections cleaned'
      });
      
    } catch (error) {
      console.error('❌ Database connection cleaning failed:', error);
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get connection status endpoint
  app.get('/db-status', async (req, res) => {
    try {
      console.log('🔍 Checking database connection status...');
      
      const status = await getConnectionStatus();
      console.log('✅ Database status retrieved');
      
      res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        connections: status
      });
      
    } catch (error) {
      console.error('❌ Database status check failed:', error);
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Convert uploaded file endpoint (for new uploads)
  app.post('/convert/upload', upload.single('video'), async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { movieId, webhookUrl } = req.body;
      
      if (!movieId || !webhookUrl) {
        return res.status(400).json({ 
          error: 'Missing required fields: movieId, webhookUrl' 
        });
      }

      const videoFile = req.file;
      if (!videoFile) {
        return res.status(400).json({ 
          error: 'No video file uploaded' 
        });
      }

      console.log(`📤 Upload conversion request: ${movieId}`);
      
      res.json({ 
        message: 'Conversion started', 
        movieId 
      });

      // Process in background
      processUploadedVideo(movieId, videoFile.path, webhookUrl, startTime);

    } catch (error) {
      console.error('Upload endpoint error:', error);
      res.status(500).json({ 
        error: 'Failed to start conversion' 
      });
    }
  });

  // Convert existing file endpoint (for files already in R2)
  app.post('/convert/existing', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { movieId, webhookUrl, deleteOriginal = false } = req.body;
      
      if (!movieId || !webhookUrl) {
        return res.status(400).json({ 
          error: 'Missing required fields: movieId, webhookUrl' 
        });
      }

      console.log(`🔄 Existing conversion request: ${movieId}`);
      
      res.json({ 
        message: 'Conversion started', 
        movieId 
      });

      // Process in background
      processExistingVideo(movieId, webhookUrl, deleteOriginal, startTime);

    } catch (error) {
      console.error('Existing conversion endpoint error:', error);
      res.status(500).json({ 
        error: 'Failed to start conversion' 
      });
    }
  });
}
