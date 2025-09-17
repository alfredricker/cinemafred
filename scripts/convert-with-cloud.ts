#!/usr/bin/env tsx

import { prisma } from '../src/lib/prisma';
import { CloudConverter } from '../src/lib/cloud-converter';

/**
 * Script to convert existing movies using Cloud Run service
 */
async function convertWithCloud() {
  console.log('🌩️ Converting movies with Cloud Run service...\n');

  try {
    // Check if converter service is healthy
    const isHealthy = await CloudConverter.healthCheck();
    if (!isHealthy) {
      console.error('❌ Converter service is not healthy');
      console.log('Make sure the service is deployed and running');
      return;
    }
    console.log('✅ Converter service is healthy\n');

    // Get movies that need conversion
    const movies = await prisma.movie.findMany({
      where: {
        r2_video_path: { not: null },
        hls_ready: false
      },
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        hls_ready: true
      },
      take: 10 // Process 10 at a time
    });

    if (movies.length === 0) {
      console.log('🎉 No movies need conversion');
      return;
    }

    console.log(`📽️ Found ${movies.length} movies to convert:\n`);

    for (const movie of movies) {
      console.log(`🎬 Starting conversion: ${movie.title}`);
      
      try {
        const result = await CloudConverter.convertExisting(movie.id);
        console.log(`✅ ${movie.title}: ${result.message}`);
      } catch (error) {
        console.error(`❌ ${movie.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n🏁 All conversion requests sent!');
    console.log('📡 Check webhooks and logs for completion status');

  } catch (error) {
    console.error('💥 Script failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('Usage: tsx convert-with-cloud.ts');
    console.log('');
    console.log('Converts existing movies to HLS using Cloud Run service');
    console.log('');
    console.log('Environment variables:');
    console.log('  CONVERTER_SERVICE_URL - URL of the Cloud Run service');
    console.log('  NEXT_PUBLIC_BASE_URL  - Base URL for webhooks');
    process.exit(0);
  }

  convertWithCloud().catch((error) => {
    console.error('💥 Conversion failed:', error);
    process.exit(1);
  });
}

export { convertWithCloud };
