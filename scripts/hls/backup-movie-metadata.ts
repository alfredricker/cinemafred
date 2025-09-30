#!/usr/bin/env tsx

import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../../src/lib/r2';
import { withDatabase } from '../../src/lib/db';

interface MovieMetadata {
  id: string;
  title: string;
  year: number;
  duration?: number;
  director: string;
  genre: string[];
  rating: number;
  averageRating?: number;
  description: string;
  created_at: string;
  updated_at: string;
}

interface BackupSummary {
  totalHLSMovies: number;
  existingBackups: number;
  newBackupsCreated: number;
  errors: string[];
}

/**
 * Get all movie IDs that have HLS directories in R2
 */
async function getHLSMovieIds(): Promise<string[]> {
  console.log('🔍 Scanning R2 for HLS directories...');
  
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: 'hls/',
    Delimiter: '/'
  });

  const response = await r2Client().send(command);
  const movieIds: string[] = [];

  if (response.CommonPrefixes) {
    for (const prefix of response.CommonPrefixes) {
      if (prefix.Prefix) {
        // Extract movie ID from "hls/{movieId}/"
        const movieId = prefix.Prefix.replace('hls/', '').replace('/', '');
        if (movieId) {
          movieIds.push(movieId);
        }
      }
    }
  }

  console.log(`📁 Found ${movieIds.length} HLS directories`);
  return movieIds;
}

/**
 * Check if info.json already exists for a movie
 */
async function hasExistingBackup(movieId: string): Promise<boolean> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `hls/${movieId}/info.json`
    });

    await r2Client().send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
}

/**
 * Get movie metadata from database (excluding Cloudflare-related fields)
 */
async function getMovieMetadata(movieId: string): Promise<MovieMetadata | null> {
  return await withDatabase(async (db) => {
    const movie = await db.movie.findUnique({
      where: { id: movieId },
      select: {
        id: true,
        title: true,
        year: true,
        duration: true,
        director: true,
        genre: true,
        rating: true,
        averageRating: true,
        description: true,
        created_at: true,
        updated_at: true,
        // Explicitly exclude Cloudflare and R2 related fields
        // cloudflare_video_id: false,
        // streaming_url: false,
        // r2_image_path: false,
        // r2_video_path: false,
        // r2_subtitles_path: false,
        // r2_hls_path: false,
        // hls_ready: false,
      }
    });

    if (!movie) {
      return null;
    }

    return {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      duration: movie.duration || undefined,
      director: movie.director,
      genre: movie.genre,
      rating: movie.rating,
      averageRating: movie.averageRating || undefined,
      description: movie.description,
      created_at: movie.created_at.toISOString(),
      updated_at: movie.updated_at.toISOString(),
    };
  });
}

/**
 * Upload info.json backup to R2
 */
async function uploadBackup(movieId: string, metadata: MovieMetadata): Promise<void> {
  const key = `hls/${movieId}/info.json`;
  const content = JSON.stringify(metadata, null, 2);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: content,
    ContentType: 'application/json',
    CacheControl: 'max-age=3600', // Cache for 1 hour
    Metadata: {
      'backup-type': 'movie-metadata',
      'created-at': new Date().toISOString(),
      'movie-title': metadata.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    }
  });

  await r2Client().send(command);
  console.log(`✅ Backed up metadata for: ${metadata.title} (${movieId})`);
}

/**
 * Main function to backup all movie metadata
 */
async function backupMovieMetadata(options: {
  force?: boolean;
  movieId?: string;
} = {}): Promise<BackupSummary> {
  const summary: BackupSummary = {
    totalHLSMovies: 0,
    existingBackups: 0,
    newBackupsCreated: 0,
    errors: []
  };

  try {
    console.log('🚀 Starting movie metadata backup process...\n');

    // Get list of movies to process
    let movieIds: string[];
    if (options.movieId) {
      movieIds = [options.movieId];
      console.log(`🎯 Processing specific movie: ${options.movieId}`);
    } else {
      movieIds = await getHLSMovieIds();
    }

    summary.totalHLSMovies = movieIds.length;

    if (movieIds.length === 0) {
      console.log('ℹ️ No HLS movies found to backup');
      return summary;
    }

    console.log(`\n📋 Processing ${movieIds.length} movies...\n`);

    // Process each movie
    for (let i = 0; i < movieIds.length; i++) {
      const movieId = movieIds[i];
      const progress = `[${i + 1}/${movieIds.length}]`;
      
      try {
        console.log(`${progress} Processing movie: ${movieId}`);

        // Check if backup already exists (unless force mode)
        if (!options.force) {
          const hasBackup = await hasExistingBackup(movieId);
          if (hasBackup) {
            console.log(`   ⏭️ Backup already exists, skipping`);
            summary.existingBackups++;
            continue;
          }
        }

        // Get movie metadata from database
        const metadata = await getMovieMetadata(movieId);
        if (!metadata) {
          const error = `Movie not found in database: ${movieId}`;
          console.log(`   ❌ ${error}`);
          summary.errors.push(error);
          continue;
        }

        // Upload backup
        await uploadBackup(movieId, metadata);
        summary.newBackupsCreated++;

      } catch (error) {
        const errorMsg = `Failed to backup ${movieId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.log(`   ❌ ${errorMsg}`);
        summary.errors.push(errorMsg);
      }
    }

    // Print summary
    console.log('\n📊 Backup Summary:');
    console.log('='.repeat(50));
    console.log(`Total HLS movies found: ${summary.totalHLSMovies}`);
    console.log(`Existing backups: ${summary.existingBackups}`);
    console.log(`New backups created: ${summary.newBackupsCreated}`);
    console.log(`Errors: ${summary.errors.length}`);

    if (summary.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      summary.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    console.log(`\n✅ Backup process completed!`);

  } catch (error) {
    const errorMsg = `Backup process failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`💥 ${errorMsg}`);
    summary.errors.push(errorMsg);
  }

  return summary;
}

/**
 * Verify a backup by comparing with current database data
 */
async function verifyBackup(movieId: string): Promise<{
  exists: boolean;
  matches: boolean;
  differences: string[];
}> {
  const result = {
    exists: false,
    matches: false,
    differences: [] as string[]
  };

  try {
    // Check if backup exists
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `hls/${movieId}/info.json`
    });

    const response = await r2Client().send(command);
    if (!response.Body) {
      return result;
    }

    result.exists = true;

    // Read backup content
    const chunks: Buffer[] = [];
    const stream = response.Body as any;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const backupContent = Buffer.concat(chunks).toString('utf-8');
    const backupData = JSON.parse(backupContent) as MovieMetadata;

    // Get current database data
    const currentData = await getMovieMetadata(movieId);
    if (!currentData) {
      result.differences.push('Movie no longer exists in database');
      return result;
    }

    // Compare key fields
    const fieldsToCompare: (keyof MovieMetadata)[] = [
      'title', 'year', 'duration', 'director', 'genre', 'rating', 'description'
    ];

    for (const field of fieldsToCompare) {
      const backupValue = backupData[field];
      const currentValue = currentData[field];
      
      if (JSON.stringify(backupValue) !== JSON.stringify(currentValue)) {
        result.differences.push(`${field}: backup="${JSON.stringify(backupValue)}" vs current="${JSON.stringify(currentValue)}"`);
      }
    }

    result.matches = result.differences.length === 0;

  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      result.exists = false;
    } else {
      result.differences.push(`Verification failed: ${error.message}`);
    }
  }

  return result;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: tsx backup-movie-metadata.ts [options]');
    console.log('');
    console.log('Options:');
    console.log('  --force                 Overwrite existing backups');
    console.log('  --movie-id <id>         Backup specific movie only');
    console.log('  --verify <id>           Verify backup for specific movie');
    console.log('  --help, -h              Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  tsx backup-movie-metadata.ts                    # Backup all movies');
    console.log('  tsx backup-movie-metadata.ts --force            # Force backup all movies');
    console.log('  tsx backup-movie-metadata.ts --movie-id abc123  # Backup specific movie');
    console.log('  tsx backup-movie-metadata.ts --verify abc123    # Verify specific backup');
    process.exit(0);
  }

  const forceMode = args.includes('--force');
  const movieIdIndex = args.indexOf('--movie-id');
  const verifyIndex = args.indexOf('--verify');
  
  if (verifyIndex !== -1 && verifyIndex + 1 < args.length) {
    // Verify mode
    const movieId = args[verifyIndex + 1];
    console.log(`🔍 Verifying backup for movie: ${movieId}\n`);
    
    verifyBackup(movieId)
      .then((result) => {
        console.log(`Backup exists: ${result.exists ? '✅' : '❌'}`);
        if (result.exists) {
          console.log(`Data matches: ${result.matches ? '✅' : '❌'}`);
          if (result.differences.length > 0) {
            console.log('\nDifferences found:');
            result.differences.forEach((diff, index) => {
              console.log(`  ${index + 1}. ${diff}`);
            });
          }
        }
      })
      .catch((error) => {
        console.error('❌ Verification failed:', error);
        process.exit(1);
      });
  } else {
    // Backup mode
    const movieId = movieIdIndex !== -1 && movieIdIndex + 1 < args.length 
      ? args[movieIdIndex + 1] 
      : undefined;

    backupMovieMetadata({ force: forceMode, movieId })
      .then((summary) => {
        const exitCode = summary.errors.length > 0 ? 1 : 0;
        process.exit(exitCode);
      })
      .catch((error) => {
        console.error('❌ Backup failed:', error);
        process.exit(1);
      });
  }
}

export { backupMovieMetadata, verifyBackup };
