#!/usr/bin/env tsx

/**
 * Improved API Prefix Cleanup Script
 *
 * Efficiently removes the api/movie/ prefix from database paths and updates
 * to organized structure. Processes in batches with proper connection management.
 *
 * This script only updates the database - it doesn't move files in R2.
 * Use this if:
 * - Files have already been migrated in R2
 * - You want to update database paths independently
 * - MP4 files have been deleted after HLS conversion
 *
 * Usage:
 *   npm run cleanup-prefix:improved
 */

import { withDatabase } from '../src/lib/db';

const BATCH_SIZE = 100; // Process 100 movies at a time

interface PathUpdate {
  id: string;
  title: string;
  year: number;
  updates: {
    r2_video_path?: string;
    r2_image_path?: string;
    r2_subtitles_path?: string;
  };
}

/**
 * Collect all movies that need path updates - uses withDatabase
 */
async function collectPathUpdates(): Promise<PathUpdate[]> {
  console.log('📋 Collecting movies that need path updates...\n');

  const movies = await withDatabase(async (db) => {
    return await db.movie.findMany({
      where: {
        OR: [
          { r2_video_path: { contains: 'api/movie/' } },
          { r2_image_path: { contains: 'api/movie/' } },
          { r2_subtitles_path: { contains: 'api/movie/' } }
        ]
      },
      select: {
        id: true,
        title: true,
        year: true,
        r2_video_path: true,
        r2_image_path: true,
        r2_subtitles_path: true,
        hls_ready: true
      }
    });
  });

  console.log(`Found ${movies.length} movies with api/movie/ prefix\n`);

  if (movies.length === 0) {
    return [];
  }

  const updates: PathUpdate[] = [];

  for (const movie of movies) {
    const pathUpdate: PathUpdate = {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      updates: {}
    };

    // Clean video path
    if (movie.r2_video_path?.includes('api/movie/')) {
      const filename = movie.r2_video_path.replace('api/movie/', '');
      pathUpdate.updates.r2_video_path = `movies/${filename}`;
    }

    // Clean image path
    if (movie.r2_image_path?.includes('api/movie/')) {
      const filename = movie.r2_image_path.replace('api/movie/', '');
      pathUpdate.updates.r2_image_path = `images/${filename}`;
    }

    // Clean subtitles path
    if (movie.r2_subtitles_path?.includes('api/movie/')) {
      const filename = movie.r2_subtitles_path.replace('api/movie/', '');
      pathUpdate.updates.r2_subtitles_path = `subtitles/${filename}`;
    }

    if (Object.keys(pathUpdate.updates).length > 0) {
      updates.push(pathUpdate);
    }
  }

  return updates;
}

/**
 * Display update summary
 */
function displayUpdateSummary(updates: PathUpdate[]): void {
  console.log('📊 Update Summary:\n');

  const videoCount = updates.filter(u => u.updates.r2_video_path).length;
  const imageCount = updates.filter(u => u.updates.r2_image_path).length;
  const subtitlesCount = updates.filter(u => u.updates.r2_subtitles_path).length;

  console.log(`   Total movies to update: ${updates.length}`);
  console.log(`   Video paths: ${videoCount}`);
  console.log(`   Image paths: ${imageCount}`);
  console.log(`   Subtitle paths: ${subtitlesCount}`);
  console.log('');

  // Show examples
  if (updates.length > 0) {
    console.log('Examples:');
    updates.slice(0, 3).forEach(update => {
      console.log(`\n   ${update.title} (${update.year}):`);
      if (update.updates.r2_video_path) {
        console.log(`     Video: → ${update.updates.r2_video_path}`);
      }
      if (update.updates.r2_image_path) {
        console.log(`     Image: → ${update.updates.r2_image_path}`);
      }
      if (update.updates.r2_subtitles_path) {
        console.log(`     Subtitles: → ${update.updates.r2_subtitles_path}`);
      }
    });
    if (updates.length > 3) {
      console.log(`\n   ... and ${updates.length - 3} more movies`);
    }
    console.log('');
  }
}

/**
 * Update database paths in batches - each batch uses withDatabase
 */
async function updatePathsInBatches(updates: PathUpdate[]): Promise<void> {
  console.log('💾 Updating database paths in batches...\n');

  const batches: PathUpdate[][] = [];
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    batches.push(updates.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches (up to ${BATCH_SIZE} records each)...\n`);

  let totalSuccess = 0;
  let totalErrors = 0;
  const errors: Array<{ movie: string; error: string }> = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNum = i + 1;
    
    console.log(`📦 Batch ${batchNum}/${batches.length} (${batch.length} movies)...`);

    // Use withDatabase for this batch - connection opens, executes, closes
    await withDatabase(async (db) => {
      for (const update of batch) {
        try {
          await db.movie.update({
            where: { id: update.id },
            data: update.updates
          });

          totalSuccess++;
          const pathCount = Object.keys(update.updates).length;
          console.log(`   ✅ ${update.title}: Updated ${pathCount} path(s)`);

        } catch (error) {
          totalErrors++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push({ movie: update.title, error: errorMsg });
          console.error(`   ❌ ${update.title}: Failed - ${errorMsg}`);
        }
      }
    });

    // Progress update (connection is now closed)
    const progress = ((batchNum / batches.length) * 100).toFixed(1);
    console.log(`   Progress: ${progress}% (${totalSuccess + totalErrors}/${updates.length})\n`);

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n📊 Final Results:');
  console.log(`   ✅ Successfully updated: ${totalSuccess}`);
  console.log(`   ❌ Errors: ${totalErrors}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Failed Updates:');
    errors.forEach(({ movie, error }) => {
      console.log(`   ${movie}: ${error}`);
    });
  }
}

/**
 * Main cleanup function
 */
async function cleanupApiPrefix() {
  console.log('🧹 Starting improved API prefix cleanup...\n');
  console.log('This will update database paths from:');
  console.log('  api/movie/file.mp4 → movies/file.mp4');
  console.log('  api/movie/image.jpg → images/image.jpg');
  console.log('  api/movie/subs.srt → subtitles/subs.srt');
  console.log('');

  try {
    // Step 1: Collect all updates needed (uses withDatabase internally)
    const updates = await collectPathUpdates();

    if (updates.length === 0) {
      console.log('✅ No api/movie/ prefixes found in database. All paths are clean!');
      return;
    }

    // Step 2: Display summary
    displayUpdateSummary(updates);

    // Step 3: Confirm
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('Proceed with database updates? (yes/no): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Cleanup cancelled.');
      return;
    }

    // Step 4: Update in batches (each batch opens/closes connection)
    await updatePathsInBatches(updates);

    console.log('\n🎉 Cleanup completed successfully!');
    console.log('\n💡 Tip: Run "npm run check-paths" to verify all paths are clean.');

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    throw error;
  }
}

// Run cleanup
cleanupApiPrefix();