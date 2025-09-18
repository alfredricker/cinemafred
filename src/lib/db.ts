import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Build DATABASE_URL with connection pool settings for Cloud Run
function buildDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return databaseUrl;
  
  // More conservative connection pool settings for Cloud Run
  const poolSettings = 'connection_limit=5&pool_timeout=20&connect_timeout=10&socket_timeout=10';
  
  return databaseUrl.includes('?') 
    ? `${databaseUrl}&${poolSettings}`
    : `${databaseUrl}?${poolSettings}`;
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      url: buildDatabaseUrl()
    }
  }
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Simple database operation wrapper - connects, executes, disconnects
export async function withDatabase<T>(operation: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  try {
    console.log('🔌 Connecting to database...');
    await prisma.$connect();
    
    const result = await operation(prisma);
    
    console.log('✅ Database operation completed');
    return result;
  } catch (error) {
    console.error('❌ Database operation failed:', error);
    throw error;
  } finally {
    try {
      await prisma.$disconnect();
      console.log('🔌 Database disconnected');
    } catch (disconnectError) {
      console.error('⚠️ Error disconnecting:', disconnectError);
    }
  }
}

// Legacy function for backwards compatibility
export async function ensureDbConnection(): Promise<void> {
  await withDatabase(async (db) => {
    await db.$queryRaw`SELECT 1`;
  });
}

// Get database diagnostics information
export async function getDatabaseDiagnostics() {
  return await withDatabase(async (db) => {
    // Get database connection info
    const connectionInfo = await db.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        max(now() - backend_start) as max_connection_age
      FROM pg_stat_activity 
      WHERE datname = current_database()
    ` as any[];
    
    // Get database settings
    const settings = await db.$queryRaw`
      SELECT name, setting, unit, context 
      FROM pg_settings 
      WHERE name IN ('max_connections', 'shared_preload_libraries', 'log_connections', 'log_disconnections')
    ` as any[];
    
    // Get current database name and user
    const dbInfo = await db.$queryRaw`
      SELECT current_database() as database, current_user as user, version() as version
    ` as any[];
    
    return {
      connectionInfo: connectionInfo[0],
      settings,
      dbInfo: dbInfo[0],
      prismaUrl: process.env.DATABASE_URL ? 'configured' : 'missing'
    };
  });
}

// Force clean all database connections (useful for debugging)
export async function cleanAllConnections(): Promise<void> {
  try {
    console.log('🧹 Force cleaning all database connections...');
    
    // Disconnect current connections
    await prisma.$disconnect();
    
    // Wait a moment for connections to fully close
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Optionally kill any remaining connections from our app
    // This requires database admin privileges
    try {
      await withDatabase(async (db) => {
        await db.$queryRaw`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity 
          WHERE datname = current_database() 
          AND pid <> pg_backend_pid()
          AND application_name LIKE '%prisma%'
        `;
      });
      console.log('✅ Terminated any remaining Prisma connections');
    } catch (error) {
      console.log('ℹ️ Could not terminate connections (may not have permissions)');
    }
    
    console.log('✅ Connection cleanup completed');
  } catch (error) {
    console.error('❌ Connection cleanup failed:', error);
    throw error;
  }
}

// Check current connection status
export async function getConnectionStatus(): Promise<{
  totalConnections: number;
  prismaConnections: number;
  activeConnections: number;
}> {
  return await withDatabase(async (db) => {
    const result = await db.$queryRaw`
      SELECT 
        COUNT(*) as total_connections,
        COUNT(*) FILTER (WHERE application_name LIKE '%prisma%') as prisma_connections,
        COUNT(*) FILTER (WHERE state = 'active') as active_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    ` as any[];
    
    return result[0];
  });
}

export default prisma