#!/usr/bin/env tsx

import prisma from '../src/lib/db';
import fs from 'fs/promises';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/data/cinemafred';

interface DeletionSummary {
  movieId: string;
  title: string;
  filesDeleted: { video: boolean; image: boolean; subtitles: boolean; hls: boolean };
  errors: string[];
}

async function deleteMediaFile(relativePath: string): Promise<boolean> {
  const fullPath = path.resolve(MEDIA_ROOT, relativePath);
  if (!fullPath.startsWith(path.resolve(MEDIA_ROOT))) return false;
  try {
    await fs.rm(fullPath, { force: true });
    console.log(`✅ Deleted: ${relativePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to delete: ${relativePath}`, error);
    return false;
  }
}

async function deleteHLSDirectory(movieId: string): Promise<boolean> {
  const fullPath = path.resolve(MEDIA_ROOT, 'hls', movieId);
  if (!fullPath.startsWith(path.resolve(MEDIA_ROOT))) return false;
  try {
    await fs.rm(fullPath, { recursive: true, force: true });
    console.log(`✅ Deleted HLS directory: hls/${movieId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to delete HLS directory for: ${movieId}`, error);
    return false;
  }
}

async function deleteMovieWithCleanup(movieId: string): Promise<DeletionSummary> {
  const summary: DeletionSummary = {
    movieId,
    title: '',
    filesDeleted: { video: false, image: false, subtitles: false, hls: false },
    errors: [],
  };

  try {
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        r2_image_path: true,
        r2_subtitles_path: true,
        r2_hls_path: true,
        hls_ready: true,
      }
    });

    if (!movie) {
      summary.errors.push('Movie not found in database');
      return summary;
    }

    summary.title = movie.title;
    console.log(`\n🗑️  Deleting movie: ${movie.title} (${movieId})`);

    if (movie.r2_video_path) {
      summary.filesDeleted.video = await deleteMediaFile(movie.r2_video_path);
      if (!summary.filesDeleted.video) summary.errors.push(`Failed to delete video: ${movie.r2_video_path}`);
    }
    if (movie.r2_image_path) {
      summary.filesDeleted.image = await deleteMediaFile(movie.r2_image_path);
      if (!summary.filesDeleted.image) summary.errors.push(`Failed to delete image: ${movie.r2_image_path}`);
    }
    if (movie.r2_subtitles_path) {
      summary.filesDeleted.subtitles = await deleteMediaFile(movie.r2_subtitles_path);
      if (!summary.filesDeleted.subtitles) summary.errors.push(`Failed to delete subtitles: ${movie.r2_subtitles_path}`);
    }
    if (movie.hls_ready) {
      summary.filesDeleted.hls = await deleteHLSDirectory(movie.id);
      if (!summary.filesDeleted.hls) summary.errors.push(`Failed to delete HLS directory`);
    }

    await prisma.$transaction([
      prisma.rating.deleteMany({ where: { movie_id: movieId } }),
      prisma.review.deleteMany({ where: { movie_id: movieId } }),
      prisma.movie.delete({ where: { id: movieId } }),
    ]);

    console.log(`✅ Deleted from database: ${movie.title}`);
  } catch (error) {
    summary.errors.push(`Database deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return summary;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run delete-movie <movie-id> [movie-id2] ...');
    console.log('       npm run delete-movie --list');
    process.exit(1);
  }

  try {
    if (args[0] === '--list') {
      const movies = await prisma.movie.findMany({
        select: { id: true, title: true, year: true },
        orderBy: { created_at: 'desc' },
        take: 20,
      });
      console.log('\n📽️  Recent Movies:');
      movies.forEach(m => console.log(`  ${m.title} (${m.year}) — ${m.id}`));
      return;
    }

    const summaries: DeletionSummary[] = [];
    for (const movieId of args) {
      summaries.push(await deleteMovieWithCleanup(movieId));
    }

    console.log('\n📊 Deletion Summary:');
    for (const s of summaries) {
      console.log(`\n🎬 ${s.title || s.movieId}:`);
      console.log(`   Video: ${s.filesDeleted.video ? '✅' : '❌'}`);
      console.log(`   Image: ${s.filesDeleted.image ? '✅' : '❌'}`);
      console.log(`   Subtitles: ${s.filesDeleted.subtitles ? '✅' : '❌'}`);
      console.log(`   HLS: ${s.filesDeleted.hls ? '✅' : '❌'}`);
      if (s.errors.length > 0) {
        s.errors.forEach(e => console.log(`   ⚠️  ${e}`));
      }
    }

    const totalErrors = summaries.reduce((n, s) => n + s.errors.length, 0);
    console.log(`\n🏁 ${summaries.length} movies processed, ${totalErrors} errors`);
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
