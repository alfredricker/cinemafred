// Job lifecycle management for Cloud Run Jobs - no direct database access

// Job lifecycle management for Cloud Run Jobs
export const JOB_START_TIME = Date.now();
export let criticalErrorCount = 0;
export const MAX_CRITICAL_ERRORS = 5; // Increased tolerance
export let activeJobs = 0; // Track active conversion jobs

// Graceful shutdown function
export function gracefulShutdown(reason: string) {
  console.log(`🛑 Shutting down gracefully: ${reason}`);
  
  // Check if there are active jobs
  if (activeJobs > 0) {
    console.log(`⚠️  ${activeJobs} active job(s) detected - extending shutdown timeout`);
    
  // Give active jobs more time to complete (10 minutes for large downloads)
  const shutdownTimeout = activeJobs > 0 ? 600000 : 30000; // 10 minutes vs 30 seconds
  
  setTimeout(() => {
    console.log(`⏰ Shutdown timeout reached after ${shutdownTimeout / 1000}s`);
    console.log('👋 Job shutdown complete');
    process.exit(0);
  }, shutdownTimeout);
} else {
  // No active jobs, shutdown quickly
  setTimeout(() => {
    console.log('👋 Job shutdown complete');
    process.exit(0);
  }, 30000);
}
}

// Job health checker (simplified for Cloud Run Jobs)
export function checkJobHealth() {
  const jobAge = Date.now() - JOB_START_TIME;
  
  // Check if too many critical errors
  if (criticalErrorCount >= MAX_CRITICAL_ERRORS) {
    console.log(`💥 Too many critical errors (${criticalErrorCount}), job should fail...`);
    return false;
  }
  
  console.log(`✅ Job health check passed: ${Math.round(jobAge / (60 * 1000))}min running, ${criticalErrorCount} errors, ${activeJobs} active jobs`);
  return true;
}

// Log critical error and increment counter
export function logCriticalError(error: any, context: string) {
  criticalErrorCount++;
  console.error(`💥 CRITICAL ERROR #${criticalErrorCount} in ${context}:`, error);

}

// Job tracking functions
export function startJob(jobId: string) {
  activeJobs++;
  console.log(`🚀 Job started: ${jobId} (${activeJobs} active jobs)`);
}

export function endJob(jobId: string) {
  activeJobs = Math.max(0, activeJobs - 1);
  console.log(`✅ Job completed: ${jobId} (${activeJobs} active jobs)`);
}

// Get job health information
export function getJobHealth() {
  const jobAge = Date.now() - JOB_START_TIME;
  const ageMinutes = Math.round(jobAge / (60 * 1000));
  
  return {
    jobAge: {
      minutes: ageMinutes
    },
    criticalErrors: {
      count: criticalErrorCount,
      maxAllowed: MAX_CRITICAL_ERRORS,
      remaining: Math.max(0, MAX_CRITICAL_ERRORS - criticalErrorCount)
    },
    activeJobs: {
      count: activeJobs
    }
  };
}

// Start job monitoring (simplified for Cloud Run Jobs)
export function startJobMonitoring() {
  // Graceful shutdown handlers for jobs
  process.on('SIGTERM', () => {
    if (activeJobs > 0) {
      console.log(`🛡️  SIGTERM received but ${activeJobs} active job(s) - allowing completion`);
      console.log(`📊 Job will complete current operation before shutdown`);
    }
    gracefulShutdown('SIGTERM received');
  });

  process.on('SIGINT', () => {
    if (activeJobs > 0) {
      console.log(`🛡️  SIGINT received but ${activeJobs} active job(s) - allowing completion`);
    }
    gracefulShutdown('SIGINT received');
  });
  
  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error);
    criticalErrorCount++;
    console.error(`💥 CRITICAL ERROR #${criticalErrorCount} in Uncaught exception:`, error);
    process.exit(1); // Jobs should exit on uncaught exceptions
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
    criticalErrorCount++;
    console.error(`💥 CRITICAL ERROR #${criticalErrorCount} in Unhandled rejection:`, reason);
    process.exit(1); // Jobs should exit on unhandled rejections
  });
}
