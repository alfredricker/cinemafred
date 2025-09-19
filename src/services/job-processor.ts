#!/usr/bin/env node

/**
 * Cloud Run Job Processor for Video Conversion
 * 
 * This service processes video conversion jobs without HTTP timeouts.
 * It reads job parameters from environment variables and processes a single video.
 */

import { processExistingVideo } from './video-processing';
import { startJob, endJob, startJobMonitoring } from './container-lifecycle';

interface JobConfig {
  movieId: string;
  jobType: 'existing'; // Only supporting existing video conversion for jobs
  deleteOriginal?: boolean;
  videoPath?: string;
}

async function parseJobConfig(): Promise<JobConfig> {
  // Job parameters are passed via environment variables
  const movieId = process.env.MOVIE_ID;
  const jobType = process.env.JOB_TYPE;
  const deleteOriginal = process.env.DELETE_ORIGINAL === 'true';

  if (!movieId) {
    throw new Error('Missing required job parameters: MOVIE_ID');
  }

  if (jobType && jobType !== 'existing') {
    throw new Error('Only "existing" job type is supported for Cloud Run Jobs');
  }

  return {
    movieId,
    jobType: 'existing',
    deleteOriginal
  };
}

async function executeJob(config: JobConfig): Promise<void> {
  const startTime = Date.now();
  const jobId = `${config.jobType}-${config.movieId}`;

  console.log(`🚀 Starting Cloud Run Job: ${jobId}`);
  console.log(`📋 Job Config:`, {
    movieId: config.movieId,
    jobType: config.jobType,
    deleteOriginal: config.deleteOriginal,
    videoPath: config.videoPath ? 'provided' : 'none'
  });

  // Track the job
  startJob(jobId);

  try {
    console.log(`🔄 Processing existing video: ${config.movieId}`);
    await processExistingVideo(
      config.movieId,
      config.deleteOriginal || false,
      startTime
    );

    const totalTime = Date.now() - startTime;
    console.log(`🎉 Job completed successfully in ${(totalTime / 1000).toFixed(1)}s`);
    
    // End job tracking
    endJob(jobId);

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`💥 Job failed after ${(totalTime / 1000).toFixed(1)}s:`, error);
    
    // End job tracking on error
    endJob(jobId);
    
    // Exit with error code so Cloud Run Job marks it as failed
    process.exit(1);
  }
}

async function main() {
  try {
    console.log('🎬 Cloud Run Job Processor Starting...');
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`🏷️  Job ID: ${process.env.CLOUD_RUN_JOB}/${process.env.CLOUD_RUN_EXECUTION}`);
    
    // Start job monitoring
    startJobMonitoring();
    
    // Parse job configuration
    const config = await parseJobConfig();
    
    // Execute the job
    await executeJob(config);
    
    console.log('✅ Job processor completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Job processor failed:', error);
    process.exit(1);
  } finally {
    // Database connections are managed by withDatabase function
    console.log('🔚 Job processor cleanup completed');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received - job will complete current operation and exit');
  // Let the current operation finish naturally
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received - job will complete current operation and exit');
  // Let the current operation finish naturally
});

// Start the job processor
main().catch((error) => {
  console.error('💥 Fatal error in job processor:', error);
  process.exit(1);
});
