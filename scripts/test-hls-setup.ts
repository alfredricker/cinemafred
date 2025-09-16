#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { hlsR2Manager } from '../src/lib/hls-r2';
import { ExistingMovieConverter } from './convert-existing-movies';

/**
 * Test script to verify HLS setup is working correctly
 */
async function testHLSSetup() {
  console.log('🧪 Testing HLS Setup...\n');

  // Test 1: Check FFmpeg installation
  console.log('1️⃣ Checking FFmpeg installation...');
  const ffmpegInstalled = await checkFFmpeg();
  if (!ffmpegInstalled) {
    console.error('❌ FFmpeg is not installed or not in PATH');
    console.log('   Install with: sudo apt install ffmpeg (Ubuntu) or brew install ffmpeg (macOS)');
    return false;
  }
  console.log('✅ FFmpeg is installed\n');

  // Test 2: Check R2 connection
  console.log('2️⃣ Testing R2 connection...');
  try {
    // Try to list objects (this will fail gracefully if no permissions)
    await hlsR2Manager.checkHLSExists('test-movie-id');
    console.log('✅ R2 connection successful\n');
  } catch (error) {
    console.error('❌ R2 connection failed:', error instanceof Error ? error.message : error);
    console.log('   Check your R2 environment variables');
    return false;
  }

  // Test 3: Check database connection
  console.log('3️⃣ Testing database connection...');
  try {
    const converter = new ExistingMovieConverter();
    const stats = await converter.getConversionStats();
    console.log('✅ Database connection successful');
    console.log(`   Found ${stats.total} movies, ${stats.converted} already converted\n`);
  } catch (error) {
    console.error('❌ Database connection failed:', error instanceof Error ? error.message : error);
    return false;
  }

  // Test 4: Check required directories
  console.log('4️⃣ Checking system requirements...');
  try {
    const os = await import('os');
    const tmpDir = os.tmpdir();
    console.log(`✅ Temp directory available: ${tmpDir}`);
    
    // Check available space (rough estimate)
    const fs = await import('fs');
    const stats = await fs.promises.stat(tmpDir);
    console.log('✅ Temp directory accessible\n');
  } catch (error) {
    console.error('❌ System requirements check failed:', error);
    return false;
  }

  console.log('🎉 All tests passed! HLS setup is ready to use.\n');
  
  console.log('📋 Next steps:');
  console.log('   1. Run: npm run convert-to-hls:stats');
  console.log('   2. Run: npm run convert-to-hls');
  console.log('   3. Update your video player to use HLS streams');
  
  return true;
}

/**
 * Check if FFmpeg is installed and accessible
 */
function checkFFmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    
    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
    
    ffmpeg.on('error', () => {
      resolve(false);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      ffmpeg.kill();
      resolve(false);
    }, 5000);
  });
}

// Run test if called directly
if (require.main === module) {
  testHLSSetup().then((success) => {
    process.exit(success ? 0 : 1);
  }).catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
}

export { testHLSSetup };
