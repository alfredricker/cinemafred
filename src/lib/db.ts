import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error', 'warn'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export function getPrismaClient(): PrismaClient {
  return prisma;
}

export async function releasePrismaClient(_client: PrismaClient): Promise<void> {
  // no-op — only needed for edge runtimes
}

export async function withDatabase<T>(operation: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  try {
    return await operation(prisma);
  } catch (error) {
    console.error('❌ Database operation failed:', error);
    throw error;
  }
}

export async function ensureDbConnection(): Promise<void> {
  await withDatabase(async (db) => {
    await db.$queryRaw`SELECT 1`;
  });
}

export async function getDatabaseDiagnostics() {
  return await withDatabase(async (db) => {
    const connectionInfo = await db.$queryRaw`
      SELECT
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        max(now() - backend_start) as max_connection_age
      FROM pg_stat_activity
      WHERE datname = current_database()
    ` as any[];

    const settings = await db.$queryRaw`
      SELECT name, setting, unit, context
      FROM pg_settings
      WHERE name IN ('max_connections', 'shared_preload_libraries', 'log_connections', 'log_disconnections')
    ` as any[];

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

export async function cleanAllConnections(): Promise<void> {
  await prisma.$disconnect();
}

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
