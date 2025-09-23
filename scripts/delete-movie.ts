#!/usr/bin/env tsx

import prisma from '../src/lib/db';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';
import { hlsR2Manager } from '../src/lib/hls/r2';

interface DeletionSummary {
  movieId: string;
  title: string;
  filesDeleted: {
    video: boolean;
    image: boolean;
    subtitles: boolean;
    hls: boolean;
  };
  errors: string[];
}

/**
 * Helper function to delete a file from R2 storage
 */
async function deleteR2File(key: string): Promise<boolean> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    await r2Client().send(command);
    console.log(`✅ Deleted R2 file: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to delete R2 file: ${key}`, error);
    return false;
  }
}

/**
 * Delete a movie and all its associated files from R2
 */
async function deleteMovieWithCleanup(movieId: string): Promise<DeletionSummary> {
  const summary: DeletionSummary = {
    movieId,
    title: '',
    filesDeleted: {
      video: false,
      image: false,
      subtitles: false,
      hls: false
    },
    errors: []
  };

  try {
    // Get movie details
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        r2_image_path: true,
        r2_subtitles_path: true,
        r2_hls_path: true,
        hls_ready: true
      }
    });

    if (!movie) {
      summary.errors.push('Movie not found in database');
      return summary;
    }

    summary.title = movie.title;
    console.log(`\n🗑️ Deleting movie: ${movie.title} (${movieId})`);

    // Delete video file
    if (movie.r2_video_path) {
      const videoKey = movie.r2_video_path.replace(/^api\/movie\//, '');
      console.log(`Deleting video: ${videoKey}`);
      summary.filesDeleted.video = await deleteR2File(videoKey);
      if (!summary.filesDeleted.video) {
        summary.errors.push(`Failed to delete video: ${videoKey}`);
      }
    }

    // Delete image file
    if (movie.r2_image_path) {
      const imageKey = movie.r2_image_path.replace(/^api\/movie\//, '');
      console.log(`Deleting image: ${imageKey}`);
      summary.filesDeleted.image = await deleteR2File(imageKey);
      if (!summary.filesDeleted.image) {
        summary.errors.push(`Failed to delete image: ${imageKey}`);
      }
    }

    // Delete subtitles file
    if (movie.r2_subtitles_path) {
      const subtitlesKey = movie.r2_subtitles_path.replace(/^api\/movie\//, '');
      console.log(`Deleting subtitles: ${subtitlesKey}`);
      summary.filesDeleted.subtitles = await deleteR2File(subtitlesKey);
      if (!summary.filesDeleted.subtitles) {
        summary.errors.push(`Failed to delete subtitles: ${subtitlesKey}`);
      }
    }

    // Delete HLS files if they exist
    if (movie.hls_ready && movie.r2_hls_path) {
      console.log(`Deleting HLS files for movie: ${movieId}`);
      try {
        await hlsR2Manager.deleteHLSFiles(movieId);
        summary.filesDeleted.hls = true;
      } catch (error) {
        summary.filesDeleted.hls = false;
        summary.errors.push(`Failed to delete HLS files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Delete from database
    await prisma.$transaction([
      prisma.rating.deleteMany({ where: { movie_id: movieId } }),
      prisma.review.deleteMany({ where: { movie_id: movieId } }),
      prisma.movie.delete({ where: { id: movieId } })
    ]);

    console.log(`✅ Successfully deleted movie from database: ${movie.title}`);

  } catch (error) {
    summary.errors.push(`Database deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return summary;
}

/**
 * Main function to handle movie deletion
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: tsx delete-movie-with-cleanup.ts <movie-id> [movie-id2] [movie-id3] ...');
    console.log('       tsx delete-movie-with-cleanup.ts --interactive');
    process.exit(1);
  }

  try {
    if (args[0] === '--interactive') {
      // Interactive mode - show movies and let user select
      const movies = await prisma.movie.findMany({
        select: {
          id: true,
          title: true,
          year: true,
          created_at: true
        },
        orderBy: { created_at: 'desc' },
        take: 20
      });

      if (movies.length === 0) {
        console.log('No movies found in database');
        return;
      }

      console.log('\n📽️ Recent Movies:');
      movies.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title} (${movie.year}) - ${movie.id}`);
      });

      console.log('\nTo delete a movie, run:');
      console.log('tsx delete-movie-with-cleanup.ts <movie-id>');
      
    } else {
      // Delete specified movies
      const summaries: DeletionSummary[] = [];
      
      for (const movieId of args) {
        const summary = await deleteMovieWithCleanup(movieId);
        summaries.push(summary);
      }

      // Print summary
      console.log('\n📊 Deletion Summary:');
      console.log('='.repeat(50));
      
      for (const summary of summaries) {
        console.log(`\n🎬 ${summary.title || summary.movieId}:`);
        console.log(`   Video: ${summary.filesDeleted.video ? '✅' : '❌'}`);
        console.log(`   Image: ${summary.filesDeleted.image ? '✅' : '❌'}`);
        console.log(`   Subtitles: ${summary.filesDeleted.subtitles ? '✅' : '❌'}`);
        console.log(`   HLS: ${summary.filesDeleted.hls ? '✅' : '❌'}`);
        
        if (summary.errors.length > 0) {
          console.log(`   Errors: ${summary.errors.length}`);
          summary.errors.forEach(error => console.log(`     - ${error}`));
        }
      }

      const totalErrors = summaries.reduce((sum, s) => sum + s.errors.length, 0);
      console.log(`\n🏁 Completed: ${summaries.length} movies processed, ${totalErrors} errors`);
    }

  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { deleteMovieWithCleanup };
