#!/usr/bin/env tsx

/**
 * Update HLS Path Script
 * 
 * Updates the HLS-related fields for a movie in the database
 * 
 * Usage:
 *   tsx scripts/update-hls-path.ts <movie-id> [hls-path]
 *   npm run update-hls-path <movie-id> [hls-path]
 */

import prisma from '../src/lib/db';

const updateHlsPath = async () => {
  const [movieId, hlsPath] = process.argv.slice(2);

  if (!movieId) {
    console.error(`
Usage: tsx scripts/update-hls-path.ts <movie-id> [hls-path]
Example: tsx scripts/update-hls-path.ts "278e0764-df03-443c-abbe-9432bdf62981" "hls/278e0764-df03-443c-abbe-9432bdf62981/"
    `);
    process.exit(1);
  }

  // Default HLS path if not provided
  const defaultHlsPath = `hls/${movieId}/`;
  const finalHlsPath = hlsPath || defaultHlsPath;

  try {
    // Check if movie exists
    const existingMovie = await prisma.movie.findUnique({
      where: { id: movieId }
    });

    if (!existingMovie) {
      console.error(`❌ Movie with ID ${movieId} not found`);
      process.exit(1);
    }

    console.log(`🎬 Found movie: ${existingMovie.title} (${existingMovie.year})`);
    console.log(`📁 Current HLS path: ${existingMovie.r2_hls_path || 'Not set'}`);
    console.log(`📁 New HLS path: ${finalHlsPath}`);

    // Update the movie with HLS information
    const updatedMovie = await prisma.movie.update({
      where: { id: movieId },
      data: {
        r2_hls_path: finalHlsPath,
        hls_ready: true  // Set to true since we're manually setting the path
      }
    });

    console.log(`✅ Successfully updated HLS path for "${updatedMovie.title}"`);
    console.log(`   HLS Path: ${updatedMovie.r2_hls_path}`);
    console.log(`   HLS Ready: ${updatedMovie.hls_ready}`);

  } catch (error) {
    console.error('❌ Failed to update HLS path:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

updateHlsPath();
