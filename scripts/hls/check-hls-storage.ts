#!/usr/bin/env tsx

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';
import { withDatabase } from '../src/lib/db';

interface QualityStorageInfo {
  quality: string;
  segmentCount: number;
  totalSize: number;
  averageSegmentSize: number;
  sizeInMB: number;
  sizeInGB: number;
}

interface MovieStorageInfo {
  movieId: string;
  title: string;
  qualities: QualityStorageInfo[];
  totalSize: number;
  totalSizeInMB: number;
  totalSizeInGB: number;
}

/**
 * Get detailed storage information for HLS files by quality level
 */
async function getHLSStorageByQuality(movieId: string): Promise<QualityStorageInfo[]> {
  const prefix = `hls/${movieId}/`;
  
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix
  });

  const response = await r2Client().send(command);
  const objects = response.Contents || [];

  // Group objects by quality level
  const qualityGroups: Record<string, { segments: any[], playlists: any[] }> = {};

  for (const obj of objects) {
    if (!obj.Key) continue;
    
    const pathParts = obj.Key.split('/');
    if (pathParts.length >= 4 && pathParts[0] === 'hls' && pathParts[1] === movieId) {
      const quality = pathParts[2];
      const filename = pathParts[3];
      
      if (!qualityGroups[quality]) {
        qualityGroups[quality] = { segments: [], playlists: [] };
      }
      
      if (filename.endsWith('.ts')) {
        qualityGroups[quality].segments.push(obj);
      } else if (filename.endsWith('.m3u8')) {
        qualityGroups[quality].playlists.push(obj);
      }
    }
  }

  // Calculate storage info for each quality
  const qualityInfo: QualityStorageInfo[] = [];

  for (const [quality, files] of Object.entries(qualityGroups)) {
    const segmentCount = files.segments.length;
    const totalSize = files.segments.reduce((sum, obj) => sum + (obj.Size || 0), 0);
    const averageSegmentSize = segmentCount > 0 ? totalSize / segmentCount : 0;

    qualityInfo.push({
      quality,
      segmentCount,
      totalSize,
      averageSegmentSize,
      sizeInMB: totalSize / (1024 * 1024),
      sizeInGB: totalSize / (1024 * 1024 * 1024)
    });
  }

  // Sort by size (largest first)
  return qualityInfo.sort((a, b) => b.totalSize - a.totalSize);
}

/**
 * Analyze storage usage for a specific movie
 */
async function analyzeMovieStorage(movieId: string): Promise<MovieStorageInfo | null> {
  // Get movie info from database
  const movie = await withDatabase(async (db) => {
    return await db.movie.findUnique({
      where: { id: movieId },
      select: { id: true, title: true, hls_ready: true }
    });
  });

  if (!movie) {
    console.log(`❌ Movie not found: ${movieId}`);
    return null;
  }

  if (!movie.hls_ready) {
    console.log(`⚠️  Movie "${movie.title}" does not have HLS files ready`);
    return null;
  }

  console.log(`🔍 Analyzing storage for: ${movie.title}`);
  
  const qualities = await getHLSStorageByQuality(movieId);
  const totalSize = qualities.reduce((sum, q) => sum + q.totalSize, 0);

  return {
    movieId,
    title: movie.title,
    qualities,
    totalSize,
    totalSizeInMB: totalSize / (1024 * 1024),
    totalSizeInGB: totalSize / (1024 * 1024 * 1024)
  };
}

/**
 * Display storage information in a formatted way
 */
function displayStorageInfo(info: MovieStorageInfo) {
  console.log(`\n📊 Storage Analysis for "${info.title}"`);
  console.log(`🆔 Movie ID: ${info.movieId}`);
  console.log(`📁 Total Size: ${info.totalSizeInMB.toFixed(2)} MB (${info.totalSizeInGB.toFixed(3)} GB)\n`);

  console.log('📋 Quality Breakdown:');
  console.log('─'.repeat(80));
  console.log('Quality'.padEnd(15) + 'Segments'.padEnd(10) + 'Size (MB)'.padEnd(12) + 'Size (GB)'.padEnd(12) + 'Avg Segment');
  console.log('─'.repeat(80));

  for (const quality of info.qualities) {
    const avgSegmentMB = (quality.averageSegmentSize / (1024 * 1024)).toFixed(2);
    console.log(
      quality.quality.padEnd(15) +
      quality.segmentCount.toString().padEnd(10) +
      quality.sizeInMB.toFixed(2).padEnd(12) +
      quality.sizeInGB.toFixed(3).padEnd(12) +
      `${avgSegmentMB} MB`
    );
  }
  console.log('─'.repeat(80));

  // Show percentage breakdown
  console.log('\n📈 Size Distribution:');
  for (const quality of info.qualities) {
    const percentage = ((quality.totalSize / info.totalSize) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(parseFloat(percentage) / 2));
    console.log(`${quality.quality.padEnd(15)} ${percentage.padStart(5)}% ${bar}`);
  }
}

/**
 * Find and display the 480p storage usage specifically
 */
function highlight480pUsage(info: MovieStorageInfo) {
  const quality480p = info.qualities.find(q => q.quality === '480p');
  
  if (quality480p) {
    console.log(`\n🎯 480p Quality Specific Info:`);
    console.log(`   Size: ${quality480p.sizeInMB.toFixed(2)} MB (${quality480p.sizeInGB.toFixed(3)} GB)`);
    console.log(`   Segments: ${quality480p.segmentCount}`);
    console.log(`   Average segment size: ${(quality480p.averageSegmentSize / (1024 * 1024)).toFixed(2)} MB`);
    
    const percentageOfTotal = ((quality480p.totalSize / info.totalSize) * 100).toFixed(1);
    console.log(`   Percentage of total: ${percentageOfTotal}%`);
  } else {
    console.log(`\n⚠️  No 480p quality found for this movie`);
    console.log(`   Available qualities: ${info.qualities.map(q => q.quality).join(', ')}`);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: tsx check-hls-storage.ts <movie-id>');
    console.log('');
    console.log('Example:');
    console.log('  tsx check-hls-storage.ts d4101816-acbd-4fb8-abef-21c02b7c540f');
    console.log('');
    console.log('This will show detailed storage breakdown by quality level for the specified movie.');
    process.exit(1);
  }

  const movieId = args[0];

  analyzeMovieStorage(movieId)
    .then((info) => {
      if (info) {
        displayStorageInfo(info);
        highlight480pUsage(info);
      }
    })
    .catch((error) => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}

export { analyzeMovieStorage, getHLSStorageByQuality };
