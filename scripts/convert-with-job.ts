#!/usr/bin/env tsx

import prisma from '../src/lib/db';
import { spawn } from 'child_process';

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
    const { r2Client, BUCKET_NAME } = await import('../src/lib/r2');
    
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
 * Execute Cloud Run Job for video conversion
 */
async function executeConversionJob(movieId: string, deleteOriginal: boolean = false): Promise<boolean> {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Executing Cloud Run Job for movie: ${movieId}`);
    
      const args = [
        'run', 'jobs', 'execute', 'hls-converter-job',
        '--region', 'us-central1',
        '--update-env-vars', `MOVIE_ID=${movieId}`,
        '--update-env-vars', `JOB_TYPE=existing`,
        '--update-env-vars', `DELETE_ORIGINAL=${deleteOriginal}`,
        '--wait'
      ];
    
    console.log(`📋 Command: gcloud ${args.join(' ')}`);
    
    const gcloud = spawn('gcloud', args, {
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    gcloud.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });
    
    gcloud.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output);
    });
    
    gcloud.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Job executed successfully for movie: ${movieId}`);
        resolve(true);
      } else {
        console.error(`❌ Job execution failed for movie: ${movieId} (exit code: ${code})`);
        resolve(false);
      }
    });
    
    gcloud.on('error', (error) => {
      console.error(`💥 Failed to execute gcloud command:`, error);
      reject(error);
    });
  });
}

/**
 * Script to convert existing movies using Cloud Run Jobs
 */
async function convertWithJob(movieId?: string, convertAll: boolean = false, force: boolean = false) {
  console.log('🎬 Converting movies with Cloud Run Jobs...\n');

  try {
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
      console.log(`  npm run convert-job -- <movie-id>     # Convert specific movie by ID`);
      console.log(`  npm run convert-job -- --all         # Convert ALL movies (be careful!)`);
      console.log(`  npm run convert-job -- --force       # Force reconvert already converted movies`);
      console.log(`  npm run convert-job -- --help        # Show help`);
      console.log('');
      console.log('💡 To convert a specific movie, copy its ID from above and run:');
      console.log(`   npm run convert-job -- <paste-id-here>`);
      
      return;
    }

    if (movies.length === 0) {
      console.log('🎉 No movies need conversion');
      return;
    }

    console.log(`📽️ Converting ${movies.length} movie(s) using Cloud Run Jobs:\n`);

    let successCount = 0;
    let failureCount = 0;

    for (const movie of movies) {
      console.log(`🎬 Starting job for: ${movie.title} (${movie.id})`);
      
      try {
        const success = await executeConversionJob(movie.id, false);
        if (success) {
          successCount++;
          console.log(`✅ ${movie.title}: Job completed successfully`);
        } else {
          failureCount++;
          console.log(`❌ ${movie.title}: Job failed`);
        }
      } catch (error) {
        failureCount++;
        console.error(`❌ ${movie.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      console.log(''); // Add spacing between jobs
    }

    console.log('\n🏁 All conversion jobs completed!');
    console.log(`📊 Results: ${successCount} successful, ${failureCount} failed`);
    console.log('📡 Check job logs for detailed status: npm run cloud -- --job-logs');

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
    console.log('Usage: npm run convert-job [-- <options>]');
    console.log('');
    console.log('Converts existing movies to HLS using Cloud Run Jobs');
    console.log('');
    console.log('Options:');
    console.log('  <movie-id>           Convert specific movie by ID');
    console.log('  --all                Convert ALL movies that need conversion');
    console.log('  --force              Force reconvert even if already converted');
    console.log('  --help, -h           Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  npm run convert-job                                    # List available movies');
    console.log('  npm run convert-job -- abc123-def456-ghi789           # Convert specific movie');
    console.log('  npm run convert-job -- --all                          # Convert all movies');
    console.log('');
    console.log('Environment variables:');
    console.log('  DATABASE_URL          - Database connection string');
    process.exit(0);
  }

  const convertAll = args.includes('--all');
  const force = args.includes('--force');
  const movieId = args.find(arg => !arg.startsWith('--'));

  convertWithJob(movieId, convertAll, force).catch((error) => {
    console.error('💥 Conversion failed:', error);
    process.exit(1);
  });
}

export { convertWithJob };
