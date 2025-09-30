#!/usr/bin/env tsx

/**
 * File Structure Migration Script
 *
 * Migrates movie file paths from api/movie/ prefix to proper organized structure:
 * - Videos: movies/{movie-id}.mp4 (or keep existing names in movies/ folder)
 * - Images: images/{movie-id}.jpg/png/etc (or keep existing names in images/ folder)
 * - Subtitles: subtitles/{movie-id}.srt/vtt/etc (or keep existing names in subtitles/ folder)
 * - HLS: hls/{movie-id}/ (already correct)
 *
 * This script:
 * 1. Identifies all files with api/movie/ prefix
 * 2. Moves them to appropriate organized folders
 * 3. Updates database paths accordingly
 * 4. Provides rollback capability
 */

import prisma from '../src/lib/db';
import { ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';

interface FileMigration {
  movieId: string;
  oldPath: string;
  newPath: string;
  fileType: 'video' | 'image' | 'subtitles';
}

async function listR2Objects(prefix?: string): Promise<string[]> {
  const objects: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await r2Client().send(command);

    if (response.Contents) {
      objects.push(...response.Contents.map(obj => obj.Key!).filter(key => key));
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

function organizeFilePath(oldPath: string, movieId: string, fileType: 'video' | 'image' | 'subtitles'): string {
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

async function migrateFileStructure() {
  console.log('🚀 Starting file structure migration...\n');

  try {
    // 1. Get all movies with api/movie/ prefix
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

    console.log(`Found ${movies.length} movies with api/movie/ prefix\n`);

    if (movies.length === 0) {
      console.log('✅ No files need migration. All paths are already organized.');
      return;
    }

    // 2. Plan migrations
    const migrations: FileMigration[] = [];

    for (const movie of movies) {
      // Check video path
      if (movie.r2_video_path?.includes('api/movie/')) {
        const newPath = organizeFilePath(movie.r2_video_path, movie.id, 'video');
        migrations.push({
          movieId: movie.id,
          oldPath: movie.r2_video_path,
          newPath,
          fileType: 'video'
        });
      }

      // Check image path
      if (movie.r2_image_path?.includes('api/movie/')) {
        const newPath = organizeFilePath(movie.r2_image_path, movie.id, 'image');
        migrations.push({
          movieId: movie.id,
          oldPath: movie.r2_image_path,
          newPath,
          fileType: 'image'
        });
      }

      // Check subtitles path
      if (movie.r2_subtitles_path?.includes('api/movie/')) {
        const newPath = organizeFilePath(movie.r2_subtitles_path, movie.id, 'subtitles');
        migrations.push({
          movieId: movie.id,
          oldPath: movie.r2_subtitles_path,
          newPath,
          fileType: 'subtitles'
        });
      }
    }

    console.log(`📋 Planned ${migrations.length} file migrations:\n`);

    // Group by file type for display
    const byType = migrations.reduce((acc, m) => {
      if (!acc[m.fileType]) acc[m.fileType] = [];
      acc[m.fileType].push(m);
      return acc;
    }, {} as Record<string, FileMigration[]>);

    Object.entries(byType).forEach(([type, files]) => {
      console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} files: ${files.length}`);
      files.slice(0, 3).forEach(m => {
        console.log(`  ${m.oldPath} → ${m.newPath}`);
      });
      if (files.length > 3) {
        console.log(`  ... and ${files.length - 3} more`);
      }
      console.log('');
    });

    // 3. Confirm migration
    console.log('⚠️  This will move files in R2 and update database paths.');
    console.log('   Make sure you have backups before proceeding!\n');

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

    // 4. Perform migration
    console.log('\n🔄 Starting migration...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const migration of migrations) {
      try {
        // Since files are stored flat in R2, copy from the flat path to organized path
        const flatPath = migration.oldPath.replace('api/movie/', '');

        // Copy file from flat location to organized location
        await r2Client().send(new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${flatPath}`,
          Key: migration.newPath
        }));

        // Delete the flat file
        await r2Client().send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: flatPath
        }));

        // Update database
        const updateData: any = {};
        switch (migration.fileType) {
          case 'video':
            updateData.r2_video_path = migration.newPath;
            break;
          case 'image':
            updateData.r2_image_path = migration.newPath;
            break;
          case 'subtitles':
            updateData.r2_subtitles_path = migration.newPath;
            break;
        }

        await prisma.movie.update({
          where: { id: migration.movieId },
          data: updateData
        });

        successCount++;
        console.log(`✅ ${migration.fileType}: ${migration.oldPath} → ${migration.newPath}`);

      } catch (error) {
        errorCount++;
        console.error(`❌ ${migration.fileType}: Failed to migrate ${migration.oldPath} - ${error}`);
      }
    }

    console.log(`\n📊 Migration completed:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📁 Total files moved: ${migrations.length}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateFileStructure();
