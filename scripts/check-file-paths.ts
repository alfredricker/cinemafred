#!/usr/bin/env tsx

/**
 * Check File Paths Script
 *
 * Checks the current file paths in the database to understand the structure
 * and identify any api/movie/ prefixes that need to be cleaned up.
 */

import prisma from '../src/lib/db';

const checkFilePaths = async () => {
  try {
    console.log('🔍 Checking file paths in database...\n');

    const movies = await prisma.movie.findMany({
      select: {
        id: true,
        title: true,
        year: true,
        r2_video_path: true,
        r2_image_path: true,
        r2_subtitles_path: true,
        r2_hls_path: true
      }
    });

    console.log(`Found ${movies.length} movies in database:\n`);

    movies.forEach((movie, index) => {
      console.log(`${index + 1}. ${movie.title} (${movie.year})`);
      console.log(`   ID: ${movie.id}`);
      console.log(`   Video: ${movie.r2_video_path}`);
      console.log(`   Image: ${movie.r2_image_path}`);
      if (movie.r2_subtitles_path) {
        console.log(`   Subtitles: ${movie.r2_subtitles_path}`);
      }
      if (movie.r2_hls_path) {
        console.log(`   HLS: ${movie.r2_hls_path}`);
      }
      console.log('');
    });

    // Check for api/movie/ prefix
    const moviesWithApiPrefix = movies.filter(movie =>
      movie.r2_video_path?.includes('api/movie/') ||
      movie.r2_image_path?.includes('api/movie/') ||
      movie.r2_subtitles_path?.includes('api/movie/')
    );

    if (moviesWithApiPrefix.length > 0) {
      console.log(`⚠️  Found ${moviesWithApiPrefix.length} movies with api/movie/ prefix:`);
      moviesWithApiPrefix.forEach(movie => {
        console.log(`   ${movie.title}:`);
        if (movie.r2_video_path?.includes('api/movie/')) {
          console.log(`     Video: ${movie.r2_video_path}`);
        }
        if (movie.r2_image_path?.includes('api/movie/')) {
          console.log(`     Image: ${movie.r2_image_path}`);
        }
        if (movie.r2_subtitles_path?.includes('api/movie/')) {
          console.log(`     Subtitles: ${movie.r2_subtitles_path}`);
        }
      });
    } else {
      console.log('✅ No movies found with api/movie/ prefix');
    }

  } catch (error) {
    console.error('❌ Error checking file paths:', error);
  } finally {
    await prisma.$disconnect();
  }
};

checkFilePaths();
