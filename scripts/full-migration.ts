#!/usr/bin/env tsx

/**
 * Full File Structure Migration Script
 *
 * Runs the complete migration process in the correct order:
 * 1. Check current paths
 * 2. Migrate files from R2 api/movie/ prefix to organized structure
 * 3. Clean up api/movie/ prefixes from database
 * 4. Verify the migration
 *
 * Usage:
 *   npm run full-migration
 */

import { execSync } from 'child_process';
import { promisify } from 'util';

async function runMigration() {
  console.log('🚀 Starting Complete File Structure Migration\n');

  try {
    // Step 1: Check current paths
    console.log('\n📋 Step 1: Checking current file paths...');
    execSync('npm run check-paths', { stdio: 'inherit' });

    // Step 2: Migrate files
    console.log('\n🔄 Step 2: Migrating files from R2...');
    execSync('npm run migrate-structure', { stdio: 'inherit' });

    // Step 3: Clean up database prefixes
    console.log('\n🧹 Step 3: Cleaning up database prefixes...');
    execSync('npm run cleanup-prefix', { stdio: 'inherit' });

    // Step 4: Verify migration
    console.log('\n✅ Step 4: Verifying migration...');
    execSync('npm run check-paths', { stdio: 'inherit' });

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📁 New file structure:');
    console.log('   Videos: movies/{filename}');
    console.log('   Images: images/{filename}');
    console.log('   Subtitles: subtitles/{filename}');
    console.log('   HLS: hls/{movie-id}/');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.log('\n🔧 To rollback, you would need to:');
    console.log('   1. Restore database from backup');
    console.log('   2. Restore files from R2 backup');
    console.log('   3. Run the migration scripts again');
    process.exit(1);
  }
}

runMigration();
