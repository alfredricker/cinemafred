import prisma from '../lib/db';

// Container lifecycle management
export const CONTAINER_START_TIME = Date.now();
export const MAX_CONTAINER_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
export let criticalErrorCount = 0;
export const MAX_CRITICAL_ERRORS = 3;

// Graceful shutdown function
export function gracefulShutdown(reason: string) {
  console.log(`🛑 Shutting down gracefully: ${reason}`);
  
  // Give ongoing operations 30 seconds to complete
  setTimeout(async () => {
    try {
      await prisma.$disconnect();
      console.log('✅ Database disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting database:', error);
    }
    
    console.log('👋 Container shutdown complete');
    process.exit(0);
  }, 30000);
}

// Auto-shutdown checker
export function checkContainerHealth() {
  const containerAge = Date.now() - CONTAINER_START_TIME;
  
  // Check if container is too old
  if (containerAge > MAX_CONTAINER_AGE_MS) {
    console.log(`⏰ Container has been running for ${Math.round(containerAge / (60 * 1000))} minutes, initiating shutdown...`);
    gracefulShutdown('Container age limit reached');
    return;
  }
  
  // Check if too many critical errors
  if (criticalErrorCount >= MAX_CRITICAL_ERRORS) {
    console.log(`💥 Too many critical errors (${criticalErrorCount}), initiating shutdown...`);
    gracefulShutdown('Critical error limit reached');
    return;
  }
}

// Log critical error and increment counter
export function logCriticalError(error: any, context: string) {
  criticalErrorCount++;
  console.error(`💥 CRITICAL ERROR #${criticalErrorCount} in ${context}:`, error);
  
  // Check if we should shutdown
  checkContainerHealth();
}

// Get container health information
export function getContainerHealth() {
  const containerAge = Date.now() - CONTAINER_START_TIME;
  const ageMinutes = Math.round(containerAge / (60 * 1000));
  const maxAgeMinutes = Math.round(MAX_CONTAINER_AGE_MS / (60 * 1000));
  
  return {
    containerAge: {
      minutes: ageMinutes,
      maxMinutes: maxAgeMinutes,
      remainingMinutes: Math.max(0, maxAgeMinutes - ageMinutes)
    },
    criticalErrors: {
      count: criticalErrorCount,
      maxAllowed: MAX_CRITICAL_ERRORS,
      remaining: Math.max(0, MAX_CRITICAL_ERRORS - criticalErrorCount)
    }
  };
}

// Start health monitoring
export function startHealthMonitoring() {
  // Run health check every 5 minutes
  setInterval(checkContainerHealth, 5 * 60 * 1000);
  
  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM received');
  });

  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT received');
  });
}
