#!/usr/bin/env tsx

/**
 * API Prefix Cleanup Script
 *
 * Removes the api/movie/ prefix from database paths for movies that have been migrated
 * to the organized structure. This should be run AFTER running the migration script.
 *
 * Usage:
 *   npm run cleanup-prefix
 */

import prisma from '../src/lib/db';

async function cleanupApiPrefix() {
  console.log('🧹 Cleaning up api/movie/ prefixes from database...\n');

  try {
    // Get movies that still have api/movie/ prefix in their paths
    const movies = await prisma.movie.findMany({
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
        r2_subtitles_path: true
      }
    });

    console.log(`Found ${movies.length} movies with remaining api/movie/ prefix\n`);

    if (movies.length === 0) {
      console.log('✅ No api/movie/ prefixes found in database. All paths are clean!');
      return;
    }

    // Update each movie to remove api/movie/ prefix
    let successCount = 0;
    let errorCount = 0;

    for (const movie of movies) {
      try {
        const updateData: any = {};

        // Clean video path and add proper prefix
        if (movie.r2_video_path?.includes('api/movie/')) {
          const filename = movie.r2_video_path.replace('api/movie/', '');
          updateData.r2_video_path = `movies/${filename}`;
        }

        // Clean image path and add proper prefix
        if (movie.r2_image_path?.includes('api/movie/')) {
          const filename = movie.r2_image_path.replace('api/movie/', '');
          updateData.r2_image_path = `images/${filename}`;
        }

        // Clean subtitles path and add proper prefix
        if (movie.r2_subtitles_path?.includes('api/movie/')) {
          const filename = movie.r2_subtitles_path.replace('api/movie/', '');
          updateData.r2_subtitles_path = `subtitles/${filename}`;
        }

        // Only update if there are changes
        if (Object.keys(updateData).length > 0) {
          await prisma.movie.update({
            where: { id: movie.id },
            data: updateData
          });

          successCount++;
          console.log(`✅ ${movie.title}: Cleaned ${Object.keys(updateData).length} path(s)`);
        }

      } catch (error) {
        errorCount++;
        console.error(`❌ ${movie.title}: Failed to clean paths - ${error}`);
      }
    }

    console.log(`\n📊 Cleanup completed:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupApiPrefix();
