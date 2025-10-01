// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/lib/db';

interface PathMigrationStats {
  moviesProcessed: number;
  imagesUpdated: number;
  videosUpdated: number;
  subtitlesUpdated: number;
  errors: string[];
}

/**
 * Migrates database paths from old format to new organized format:
 * 
 * Old Format:
 * - r2_image_path: "api/movie/poster.jpg"
 * - r2_video_path: "api/movie/video.mp4"
 * - r2_subtitles_path: "api/movie/subtitles.srt"
 * 
 * New Format:
 * - r2_image_path: "images/poster.jpg"
 * - r2_video_path: "movies/video.mp4"
 * - r2_subtitles_path: "subtitles/subtitles.srt"
 */
async function migrateDatabasePaths() {
  console.log('🚀 Starting database path migration...\n');

  const stats: PathMigrationStats = {
    moviesProcessed: 0,
    imagesUpdated: 0,
    videosUpdated: 0,
    subtitlesUpdated: 0,
    errors: [],
  };

  try {
    // Fetch all movies
    const movies = await prisma.movie.findMany({
      select: {
        id: true,
        title: true,
        r2_image_path: true,
        r2_video_path: true,
        r2_subtitles_path: true,
      },
    });

    console.log(`📋 Found ${movies.length} movies to process\n`);

    for (const movie of movies) {
      stats.moviesProcessed++;
      console.log(`Processing: ${movie.title} (${movie.id})`);

      const updates: {
        r2_image_path?: string;
        r2_video_path?: string;
        r2_subtitles_path?: string | null;
      } = {};

      // Migrate image path
      if (movie.r2_image_path) {
        let newImagePath = movie.r2_image_path;
        
        if (movie.r2_image_path.startsWith('api/movie/')) {
          // Remove "api/movie/" prefix and add "images/" prefix
          const filename = movie.r2_image_path.replace('api/movie/', '');
          newImagePath = `images/${filename}`;
          stats.imagesUpdated++;
          console.log(`  Image: ${movie.r2_image_path} → ${newImagePath}`);
        } else if (!movie.r2_image_path.startsWith('images/')) {
          // If it doesn't have any prefix, assume it's a root file and add images/
          newImagePath = `images/${movie.r2_image_path}`;
          stats.imagesUpdated++;
          console.log(`  Image: ${movie.r2_image_path} → ${newImagePath}`);
        } else {
          console.log(`  Image: Already correct (${newImagePath})`);
        }
        
        if (newImagePath !== movie.r2_image_path) {
          updates.r2_image_path = newImagePath;
        }
      }

      // Migrate video path
      if (movie.r2_video_path) {
        let newVideoPath = movie.r2_video_path;
        
        if (movie.r2_video_path.startsWith('api/movie/')) {
          // Remove "api/movie/" prefix and add "movies/" prefix
          const filename = movie.r2_video_path.replace('api/movie/', '');
          newVideoPath = `movies/${filename}`;
          stats.videosUpdated++;
          console.log(`  Video: ${movie.r2_video_path} → ${newVideoPath}`);
        } else if (!movie.r2_video_path.startsWith('movies/') && !movie.r2_video_path.startsWith('hls/')) {
          // If it doesn't have any prefix and it's not HLS, assume it's a root file
          newVideoPath = `movies/${movie.r2_video_path}`;
          stats.videosUpdated++;
          console.log(`  Video: ${movie.r2_video_path} → ${newVideoPath}`);
        } else {
          console.log(`  Video: Already correct (${newVideoPath})`);
        }
        
        if (newVideoPath !== movie.r2_video_path) {
          updates.r2_video_path = newVideoPath;
        }
      }

      // Migrate subtitles path
      if (movie.r2_subtitles_path) {
        let newSubtitlesPath = movie.r2_subtitles_path;
        
        if (movie.r2_subtitles_path.startsWith('api/movie/')) {
          // Remove "api/movie/" prefix and add "subtitles/" prefix
          const filename = movie.r2_subtitles_path.replace('api/movie/', '');
          newSubtitlesPath = `subtitles/${filename}`;
          stats.subtitlesUpdated++;
          console.log(`  Subtitles: ${movie.r2_subtitles_path} → ${newSubtitlesPath}`);
        } else if (!movie.r2_subtitles_path.startsWith('subtitles/')) {
          // If it doesn't have any prefix, assume it's a root file
          newSubtitlesPath = `subtitles/${movie.r2_subtitles_path}`;
          stats.subtitlesUpdated++;
          console.log(`  Subtitles: ${movie.r2_subtitles_path} → ${newSubtitlesPath}`);
        } else {
          console.log(`  Subtitles: Already correct (${newSubtitlesPath})`);
        }
        
        if (newSubtitlesPath !== movie.r2_subtitles_path) {
          updates.r2_subtitles_path = newSubtitlesPath;
        }
      }

      // Update database if there are changes
      if (Object.keys(updates).length > 0) {
        try {
          await prisma.movie.update({
            where: { id: movie.id },
            data: updates,
          });
          console.log(`  ✅ Updated database\n`);
        } catch (error) {
          const errorMsg = `Failed to update ${movie.title}: ${error}`;
          console.error(`  ❌ ${errorMsg}\n`);
          stats.errors.push(errorMsg);
        }
      } else {
        console.log(`  ℹ️  No changes needed\n`);
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 MIGRATION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Movies processed:        ${stats.moviesProcessed}`);
    console.log(`Images updated:          ${stats.imagesUpdated}`);
    console.log(`Videos updated:          ${stats.videosUpdated}`);
    console.log(`Subtitles updated:       ${stats.subtitlesUpdated}`);
    console.log(`Errors:                  ${stats.errors.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (stats.errors.length > 0) {
      console.log('❌ Errors encountered:');
      stats.errors.forEach(err => console.log(`  - ${err}`));
      console.log();
    }

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateDatabasePaths();

