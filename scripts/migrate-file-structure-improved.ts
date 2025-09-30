#!/usr/bin/env tsx

/**
 * Improved File Structure Migration Script
 *
 * Efficiently migrates movie file paths from api/movie/ prefix to organized structure:
 * - Videos: movies/{filename}.mp4
 * - Images: images/{filename}.jpg/png
 * - Subtitles: subtitles/{filename}.srt/vtt
 * - HLS: hls/{movie-id}/ (already correct)
 *
 * Improvements:
 * - Batch processing with proper database connection management
 * - Checks if files exist before migration (handles missing MP4s gracefully)
 * - Separates R2 migration from database updates
 * - Better error handling and progress tracking
 * - Skips MP4 files that have been replaced with HLS
 */

import { withDatabase } from '../src/lib/db';
import { HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';

const BATCH_SIZE = 50; // Process 50 movies at a time
const R2_BATCH_SIZE = 10; // Process 10 R2 operations at a time

interface FileStatus {
  path: string;
  exists: boolean;
  size?: number;
}

interface MovieMigration {
  id: string;
  title: string;
  year: number;
  video?: {
    oldPath: string;
    newPath: string;
    flatPath: string;
    exists: boolean;
  };
  image?: {
    oldPath: string;
    newPath: string;
    flatPath: string;
    exists: boolean;
  };
  subtitles?: {
    oldPath: string;
    newPath: string;
    flatPath: string;
    exists: boolean;
  };
}

/**
 * Check if a file exists in R2
 */
async function checkFileExists(key: string): Promise<FileStatus> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const response = await r2Client().send(command);
    
    return {
      path: key,
      exists: true,
      size: response.ContentLength
    };
  } catch (error: any) {
    if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
      return {
        path: key,
        exists: false
      };
    }
    throw error;
  }
}

/**
 * Organize file path based on type
 */
function organizeFilePath(oldPath: string, fileType: 'video' | 'image' | 'subtitles'): string {
  const fileName = oldPath.split('/').pop()!;

  switch (fileType) {
    case 'video':
      return `movies/${fileName}`;
    case 'image':
      return `images/${fileName}`;
    case 'subtitles':
      return `subtitles/${fileName}`;
    default:
      return oldPath;
  }
}

/**
 * Get flat path (remove api/movie/ prefix)
 */
function getFlatPath(dbPath: string): string {
  return dbPath.replace('api/movie/', '');
}

/**
 * Collect migration plan for all movies - uses withDatabase
 */
async function collectMigrationPlan(): Promise<MovieMigration[]> {
  console.log('📋 Collecting migration plan from database...\n');

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

  const migrations: MovieMigration[] = [];

  for (const movie of movies) {
    const migration: MovieMigration = {
      id: movie.id,
      title: movie.title,
      year: movie.year
    };

    // Check video path
    if (movie.r2_video_path?.includes('api/movie/')) {
      const flatPath = getFlatPath(movie.r2_video_path);
      migration.video = {
        oldPath: movie.r2_video_path,
        newPath: organizeFilePath(movie.r2_video_path, 'video'),
        flatPath,
        exists: false // Will be checked later
      };
    }

    // Check image path
    if (movie.r2_image_path?.includes('api/movie/')) {
      const flatPath = getFlatPath(movie.r2_image_path);
      migration.image = {
        oldPath: movie.r2_image_path,
        newPath: organizeFilePath(movie.r2_image_path, 'image'),
        flatPath,
        exists: false // Will be checked later
      };
    }

    // Check subtitles path
    if (movie.r2_subtitles_path?.includes('api/movie/')) {
      const flatPath = getFlatPath(movie.r2_subtitles_path);
      migration.subtitles = {
        oldPath: movie.r2_subtitles_path,
        newPath: organizeFilePath(movie.r2_subtitles_path, 'subtitles'),
        flatPath,
        exists: false // Will be checked later
      };
    }

    migrations.push(migration);
  }

  return migrations;
}

/**
 * Check which files actually exist in R2
 */
async function checkFilesExistence(migrations: MovieMigration[]): Promise<void> {
  console.log('🔍 Checking which files exist in R2...\n');

  let totalFiles = 0;
  let existingFiles = 0;
  let missingFiles = 0;

  for (const migration of migrations) {
    // Check video
    if (migration.video) {
      totalFiles++;
      const status = await checkFileExists(migration.video.flatPath);
      migration.video.exists = status.exists;
      if (status.exists) {
        existingFiles++;
      } else {
        missingFiles++;
        console.log(`⚠️  Missing video: ${migration.title} - ${migration.video.flatPath}`);
      }
    }

    // Check image
    if (migration.image) {
      totalFiles++;
      const status = await checkFileExists(migration.image.flatPath);
      migration.image.exists = status.exists;
      if (status.exists) {
        existingFiles++;
      } else {
        missingFiles++;
        console.log(`⚠️  Missing image: ${migration.title} - ${migration.image.flatPath}`);
      }
    }

    // Check subtitles
    if (migration.subtitles) {
      totalFiles++;
      const status = await checkFileExists(migration.subtitles.flatPath);
      migration.subtitles.exists = status.exists;
      if (status.exists) {
        existingFiles++;
      } else {
        missingFiles++;
      }
    }
  }

  console.log(`\n📊 File Status:`);
  console.log(`   Total files: ${totalFiles}`);
  console.log(`   ✅ Existing: ${existingFiles}`);
  console.log(`   ❌ Missing: ${missingFiles}`);
  console.log('');
}

/**
 * Migrate files in R2 in batches (only files that exist)
 */
async function migrateR2Files(migrations: MovieMigration[]): Promise<void> {
  console.log('🔄 Migrating files in R2 (no DB connection held)...\n');

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // Collect all file operations
  const fileOps: Array<{
    type: string;
    title: string;
    file: NonNullable<MovieMigration['video']>;
  }> = [];

  for (const migration of migrations) {
    if (migration.video) fileOps.push({ type: 'video', title: migration.title, file: migration.video });
    if (migration.image) fileOps.push({ type: 'image', title: migration.title, file: migration.image });
    if (migration.subtitles) fileOps.push({ type: 'subtitles', title: migration.title, file: migration.subtitles });
  }

  // Process in batches
  for (let i = 0; i < fileOps.length; i += R2_BATCH_SIZE) {
    const batch = fileOps.slice(i, i + R2_BATCH_SIZE);
    console.log(`\n📦 R2 Batch ${Math.floor(i / R2_BATCH_SIZE) + 1}/${Math.ceil(fileOps.length / R2_BATCH_SIZE)} (${batch.length} files)...`);

    for (const { type, title, file } of batch) {
      if (!file.exists) {
        skipCount++;
        console.log(`⏭️  Skipping ${type}: ${title} (file doesn't exist)`);
        continue;
      }

      try {
        // Copy file to new organized location
        await r2Client().send(new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${file.flatPath}`,
          Key: file.newPath
        }));

        successCount++;
        console.log(`✅ ${type}: ${title}`);
        console.log(`   ${file.flatPath} → ${file.newPath}`);

      } catch (error) {
        errorCount++;
        console.error(`❌ ${type}: ${title} - Failed to migrate`);
        console.error(`   Error: ${error}`);
      }
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n📊 R2 Migration Results:`);
  console.log(`   ✅ Migrated: ${successCount}`);
  console.log(`   ⏭️  Skipped: ${skipCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('');
}

/**
 * Update database paths in batches - each batch uses withDatabase
 */
async function updateDatabasePaths(migrations: MovieMigration[]): Promise<void> {
  console.log('💾 Updating database paths in batches...\n');

  const batches: MovieMigration[][] = [];
  for (let i = 0; i < migrations.length; i += BATCH_SIZE) {
    batches.push(migrations.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches (${BATCH_SIZE} records each)...\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n📦 Batch ${i + 1}/${batches.length} (${batch.length} movies)...`);

    // Use withDatabase for this batch - connection opens, executes, closes
    await withDatabase(async (db) => {
      for (const migration of batch) {
        try {
          const updateData: any = {};

          // Always update to new path structure, even if file doesn't exist
          // This handles cases where MP4s were deleted after HLS conversion
          if (migration.video) {
            updateData.r2_video_path = migration.video.newPath;
          }

          if (migration.image) {
            updateData.r2_image_path = migration.image.newPath;
          }

          if (migration.subtitles) {
            updateData.r2_subtitles_path = migration.subtitles.newPath;
          }

          if (Object.keys(updateData).length > 0) {
            await db.movie.update({
              where: { id: migration.id },
              data: updateData
            });

            totalUpdated++;
            console.log(`   ✅ ${migration.title}: Updated ${Object.keys(updateData).length} path(s)`);
          } else {
            totalSkipped++;
          }

        } catch (error) {
          totalErrors++;
          console.error(`   ❌ ${migration.title}: Failed to update database`);
          console.error(`      Error: ${error}`);
        }
      }
    });

    // Connection is now closed, small delay before next batch
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n📊 Database Update Results:`);
  console.log(`   ✅ Updated: ${totalUpdated}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log(`   ❌ Errors: ${totalErrors}`);
}

/**
 * Main migration function
 */
async function migrateFileStructure() {
  console.log('🚀 Starting improved file structure migration...\n');
  console.log('This migration will:');
  console.log('1. Collect all movies needing migration');
  console.log('2. Check which files actually exist in R2');
  console.log('3. Migrate existing files to organized structure');
  console.log('4. Update database paths (even for missing files)');
  console.log('');

  try {
    // Step 1: Collect migration plan (uses withDatabase internally)
    const migrations = await collectMigrationPlan();

    if (migrations.length === 0) {
      console.log('✅ No files need migration. All paths are already organized.');
      return;
    }

    // Step 2: Check which files exist (no DB connection needed)
    await checkFilesExistence(migrations);

    // Step 3: Confirm migration
    console.log('⚠️  This will migrate files in R2 and update database paths.');
    console.log('   Note: MP4 files that have been converted to HLS will be skipped.\n');

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('Do you want to proceed with migration? (yes/no): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Migration cancelled.');
      return;
    }

    // Step 4: Migrate R2 files in batches (no DB connection)
    await migrateR2Files(migrations);

    // Step 5: Update database paths in batches (each batch opens/closes connection)
    await updateDatabasePaths(migrations);

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📁 New file structure:');
    console.log('   Videos: movies/{filename}');
    console.log('   Images: images/{filename}');
    console.log('   Subtitles: subtitles/{filename}');
    console.log('   HLS: hls/{movie-id}/');
    console.log('\n💡 Tip: Run "npm run check-paths" to verify the migration.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
migrateFileStructure();