#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getConversionStatus() {
  console.log('🎬 Movie Conversion Status Report\n');

  try {
    // Get total movies with video files
    const totalWithVideo = await prisma.movie.count({
      where: { r2_video_path: { not: '' } }
    });

    // Get successfully converted movies
    const successfullyConverted = await prisma.movie.count({
      where: {
        AND: [
          { r2_video_path: { not: '' } },
          { r2_hls_path: { not: null } },
          { r2_hls_path: { not: '' } },
          { hls_ready: true }
        ]
      }
    });

    // Get movies that need conversion (robust check)
    const needsConversion = await prisma.movie.count({
      where: {
        AND: [
          // Have a valid video path
          { r2_video_path: { not: '' } },
          // AND either no HLS path OR HLS not ready (failed conversion)
          {
            OR: [
              { r2_hls_path: null },
              { r2_hls_path: '' },
              { hls_ready: false }
            ]
          }
        ]
      }
    });

    // Get failed conversions (have HLS path but not ready)
    const failedConversions = await prisma.movie.count({
      where: {
        AND: [
          { r2_video_path: { not: '' } },
          { r2_hls_path: { not: null } },
          { r2_hls_path: { not: '' } },
          { hls_ready: false }
        ]
      }
    });

    // Get movies without HLS path at all
    const noHLSPath = await prisma.movie.count({
      where: {
        AND: [
          { r2_video_path: { not: '' } },
          {
            OR: [
              { r2_hls_path: null },
              { r2_hls_path: '' }
            ]
          }
        ]
      }
    });

    console.log('📊 Summary:');
    console.log(`   Total movies with video files: ${totalWithVideo}`);
    console.log(`   Successfully converted: ${successfullyConverted}`);
    console.log(`   Need conversion: ${needsConversion}`);
    console.log(`   Failed conversions: ${failedConversions}`);
    console.log(`   No HLS path: ${noHLSPath}`);
    console.log('');

    const conversionRate = totalWithVideo > 0 ? ((successfullyConverted / totalWithVideo) * 100).toFixed(1) : '0';
    console.log(`✅ Conversion rate: ${conversionRate}%`);
    
    if (needsConversion > 0) {
      console.log(`🔄 Ready to convert ${needsConversion} movies`);
      console.log('');
      console.log('💡 To convert all movies that need conversion:');
      console.log('   npm run convert-job -- --all');
      console.log('   npm run convert-to-hls -- --all');
    } else {
      console.log('🎉 All movies are successfully converted!');
    }

    // Show some examples of movies that need conversion
    if (needsConversion > 0) {
      console.log('\n📋 Sample movies that need conversion:');
      const sampleMovies = await prisma.movie.findMany({
        where: {
          AND: [
            { r2_video_path: { not: '' } },
            {
              OR: [
                { r2_hls_path: null },
                { r2_hls_path: '' },
                { hls_ready: false }
              ]
            }
          ]
        },
        select: {
          id: true,
          title: true,
          r2_hls_path: true,
          hls_ready: true
        },
        take: 5
      });

      sampleMovies.forEach((movie, index) => {
        const status = movie.r2_hls_path ? 
          (movie.hls_ready ? '✅ Ready' : '❌ Failed') : 
          '⏳ Not started';
        console.log(`   ${index + 1}. ${movie.title} - ${status}`);
      });
      
      if (needsConversion > 5) {
        console.log(`   ... and ${needsConversion - 5} more`);
      }
    }

  } catch (error) {
    console.error('💥 Error getting conversion status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI usage
if (require.main === module) {
  getConversionStatus().catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
}

export { getConversionStatus };
