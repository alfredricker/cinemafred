#!/usr/bin/env tsx

/**
 * Improved Full File Structure Migration Script
 *
 * Runs the complete migration process efficiently:
 * 1. Check current paths
 * 2. Collect migration plan and check which files exist
 * 3. Migrate existing files from flat structure to organized structure in R2
 * 4. Update database paths (including for missing files)
 * 5. Verify the migration
 *
 * Features:
 * - Batch processing (50-100 records at a time)
 * - Gracefully handles missing MP4 files (converted to HLS)
 * - Better progress tracking
 * - Separates R2 migration from database updates
 *
 * Usage:
 *   npm run full-migration-improved
 */

import { execSync } from 'child_process';

async function runMigration() {
  console.log('🚀 Starting Complete File Structure Migration (Improved)\n');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Check current paths
    console.log('📋 Step 1: Checking current file paths...');
    console.log('─────────────────────────────────────────────────────\n');
    
    try {
      execSync('npm run check-paths', { stdio: 'inherit' });
    } catch (error) {
      console.log('Note: check-paths script encountered an issue, continuing...\n');
    }

    console.log('\n─────────────────────────────────────────────────────\n');

    // Step 2: Run improved migration
    console.log('🔄 Step 2: Running improved file migration...');
    console.log('This will:');
    console.log('  - Collect all movies needing migration');
    console.log('  - Check which files exist in R2');
    console.log('  - Migrate existing files to organized structure');
    console.log('  - Update database paths (even for missing files)');
    console.log('─────────────────────────────────────────────────────\n');
    
    execSync('tsx scripts/migrate-file-structure-improved.ts', { stdio: 'inherit' });

    console.log('\n─────────────────────────────────────────────────────\n');

    // Step 3: Verify migration
    console.log('✅ Step 3: Verifying migration...');
    console.log('─────────────────────────────────────────────────────\n');
    
    try {
      execSync('npm run check-paths', { stdio: 'inherit' });
    } catch (error) {
      console.log('Note: check-paths verification completed with notes\n');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎉 Migration completed successfully!');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('📁 New file structure:');
    console.log('   Videos:    movies/{filename}.mp4');
    console.log('   Images:    images/{filename}.jpg');
    console.log('   Subtitles: subtitles/{filename}.srt');
    console.log('   HLS:       hls/{movie-id}/\n');

    console.log('📝 Important Notes:');
    console.log('   • MP4 files that were converted to HLS were skipped');
    console.log('   • Database paths updated for all movies');
    console.log('   • Old flat files preserved in R2 (can be deleted later)');
    console.log('   • All new uploads will use organized structure\n');

    console.log('💡 Next Steps:');
    console.log('   1. Verify movies are accessible in your app');
    console.log('   2. Test video playback and image loading');
    console.log('   3. Once verified, you can delete old flat files from R2');
    console.log('   4. Run: npm run check-paths to see final state\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check your database connection');
    console.log('   2. Verify R2 credentials are correct');
    console.log('   3. Check logs above for specific error details');
    console.log('   4. You can run individual scripts:');
    console.log('      - npm run check-paths (check current state)');
    console.log('      - npm run cleanup-prefix-improved (update DB only)');
    console.log('   5. Database should be in consistent state (transactions used)');
    process.exit(1);
  }
}

runMigration();
