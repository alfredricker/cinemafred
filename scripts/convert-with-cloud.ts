#!/usr/bin/env tsx

import prisma from '../src/lib/db';
import { CloudConverter } from '../src/lib/cloud-converter';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';

/**
 * Strip API prefix from database paths to get actual R2 path
 */
function stripApiPrefix(path: string): string {
  // Remove 'api/movie/' prefix that exists in database but not in R2
  return path.replace(/^api\/movie\//, '');
}

/**
 * Check if original video file exists in R2
 */
async function checkOriginalVideoExists(videoPath: string): Promise<boolean> {
  try {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    
    // Strip the API prefix to get actual R2 path
    const actualR2Path = stripApiPrefix(videoPath);
    
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: actualR2Path
    });

    await r2Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      return false;
    }
    console.error(`❌ Error checking original video ${videoPath} (R2 path: ${stripApiPrefix(videoPath)}):`, error);
    return false;
  }
}

/**
 * Script to convert existing movies using Cloud Run service
 */
async function convertWithCloud(movieId?: string, convertAll: boolean = false, force: boolean = false) {
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

    let movies;

    if (movieId) {
      // Convert specific movie by ID
      console.log(`🎯 Converting specific movie: ${movieId}`);
      
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
        console.error(`❌ Movie with ID ${movieId} not found`);
        return;
      }

      // Check conversion status using database as source of truth
      console.log(`🔍 Checking conversion status for "${movie.title}"...`);
      
      console.log(`📊 Status check results:`);
      console.log(`   Database hls_ready: ${movie.hls_ready}`);
      console.log(`   Database hls_path: ${movie.r2_hls_path || 'none'}`);
      console.log(`   Database video path: ${movie.r2_video_path}`);
      console.log(`   Actual R2 path: ${stripApiPrefix(movie.r2_video_path)}`);

      // Check if already converted (has HLS URL in database)
      if (movie.r2_hls_path && !force) {
        console.log(`⚠️ Movie "${movie.title}" is already converted (has HLS URL in database)`);
        console.log(`   HLS path: ${movie.r2_hls_path}`);
        console.log('Use --force flag to reconvert anyway');
        return;
      }

      // Check if original video exists before attempting conversion
      console.log(`🔍 Verifying original video exists...`);
      const originalExists = await checkOriginalVideoExists(movie.r2_video_path);
      if (!originalExists) {
        console.error(`❌ Cannot convert "${movie.title}" - original video file missing from R2`);
        console.error(`   Database path: ${movie.r2_video_path}`);
        console.error(`   Actual R2 path checked: ${stripApiPrefix(movie.r2_video_path)}`);
        console.log(`   This movie's database entry points to a non-existent file.`);
        return;
      }

      console.log(`✅ Ready to convert "${movie.title}"`);
      
      if (force) {
        console.log(`🔄 Force reconverting (--force flag used)`);
      }

      movies = [movie];
    } else if (convertAll) {
      // Convert all movies that need conversion
      console.log('🌍 Converting ALL movies that need conversion...');
      
      movies = await prisma.movie.findMany({
        where: {
          r2_hls_path: null  // Only movies without HLS URL (not converted yet)
        },
        select: {
          id: true,
          title: true,
          r2_video_path: true,
          r2_hls_path: true,
          hls_ready: true
        },
        take: 50 // Process up to 50 at a time
      });
    } else {
      // Show available movies but don't convert
      console.log('📋 Movies available for conversion:\n');
      
      // Get total count first
      const totalCount = await prisma.movie.count({
        where: {
          r2_hls_path: null  // Only movies without HLS URL
        }
      });
      
      const availableMovies = await prisma.movie.findMany({
        where: {
          r2_hls_path: null  // Only movies without HLS URL
        },
        select: {
          id: true,
          title: true,
          r2_video_path: true,
          r2_hls_path: true,
          hls_ready: true
        },
        take: 100
      });

      if (availableMovies.length === 0) {
        console.log('🎉 No movies need conversion');
        return;
      }

      console.log(`Found ${totalCount} total movies that need conversion (showing first ${Math.min(availableMovies.length, 100)}):\n`);
      
      // Show movies that need conversion (simplified - database is source of truth)
      for (let i = 0; i < availableMovies.length; i++) {
        const movie = availableMovies[i];
        console.log(`${i + 1}. ${movie.title}`);
        console.log(`   ID: ${movie.id}`);
        console.log(`   Video: ${movie.r2_video_path}`);
        console.log(`   Status: ✅ Ready for conversion (no HLS URL in database)`);
        console.log('');
      }

      console.log('📊 Summary:');
      console.log(`   ✅ Movies ready for conversion: ${availableMovies.length}`);
      console.log(`   📝 Total movies needing conversion: ${totalCount}`);
      console.log('');

      console.log('💡 Usage:');
      console.log(`  npm run convert-cloud -- <movie-id>     # Convert specific movie by ID`);
      console.log(`  npm run convert-cloud -- --all         # Convert ALL movies (be careful!)`);
      console.log(`  npm run convert-cloud -- --force       # Force reconvert already converted movies`);
      console.log(`  npm run convert-cloud -- --help        # Show help`);
      console.log('');
      console.log('💡 To convert a specific movie, copy its ID from above and run:');
      console.log(`   npm run convert-cloud -- <paste-id-here>`);
      
      return;
    }

    if (movies.length === 0) {
      console.log('🎉 No movies need conversion');
      return;
    }

    console.log(`📽️ Converting ${movies.length} movie(s):\n`);

    for (const movie of movies) {
      console.log(`🎬 Starting conversion: ${movie.title} (${movie.id})`);
      
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
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run convert-cloud [-- <options>]');
    console.log('');
    console.log('Converts existing movies to HLS using Cloud Run service');
    console.log('');
    console.log('Options:');
    console.log('  <movie-id>           Convert specific movie by ID');
    console.log('  --all                Convert ALL movies that need conversion');
    console.log('  --force              Force reconvert even if already converted');
    console.log('  --help, -h           Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  npm run convert-cloud                                    # List available movies');
    console.log('  npm run convert-cloud -- abc123-def456-ghi789           # Convert specific movie');
    console.log('  npm run convert-cloud -- --all                          # Convert all movies');
    console.log('');
    console.log('Environment variables:');
    console.log('  CONVERTER_SERVICE_URL - URL of the Cloud Run service');
    console.log('  NEXT_PUBLIC_BASE_URL  - Base URL for webhooks');
    process.exit(0);
  }

  const convertAll = args.includes('--all');
  const force = args.includes('--force');
  const movieId = args.find(arg => !arg.startsWith('--'));

  convertWithCloud(movieId, convertAll, force).catch((error) => {
    console.error('💥 Conversion failed:', error);
    process.exit(1);
  });
}

export { convertWithCloud };
