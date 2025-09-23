#!/usr/bin/env tsx

/**
 * Check HLS Segment Integrity
 * 
 * Verifies that HLS segments contain valid media data and identifies corrupted segments
 * 
 * Usage:
 *   npm run check-segments -- <movie-id>
 *   tsx scripts/check-segment-integrity.ts <movie-id>
 */

import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '../src/lib/r2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SegmentCheck {
  segment: string;
  size: number;
  isValid: boolean;
  error?: string;
}

class SegmentIntegrityChecker {
  
  async checkMovieSegments(movieId: string): Promise<void> {
    console.log(`🔍 Checking segment integrity for movie: ${movieId}`);
    
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true, title: true, r2_hls_path: true }
    });

    if (!movie) {
      console.log(`❌ Movie not found: ${movieId}`);
      return;
    }

    if (!movie.r2_hls_path) {
      console.log(`❌ Movie has no HLS conversion: ${movie.title}`);
      return;
    }

    console.log(`📽️  Checking: ${movie.title}`);
    
    // Get all segments for this movie
    const segments = await this.getMovieSegments(movieId);
    console.log(`📊 Found ${segments.length} segments to check`);
    
    // Check segments in batches
    const batchSize = 10;
    const results: SegmentCheck[] = [];
    
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      console.log(`🔍 Checking batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(segments.length / batchSize)}`);
      
      const batchResults = await Promise.all(
        batch.map(segment => this.checkSegment(movieId, segment))
      );
      
      results.push(...batchResults);
      
      // Show progress
      const checked = Math.min(i + batchSize, segments.length);
      process.stdout.write(`\r📊 Checked ${checked}/${segments.length} segments...`);
    }
    
    console.log('\n');
    
    // Analyze results
    this.analyzeResults(results, movie.title);
  }

  private async getMovieSegments(movieId: string): Promise<string[]> {
    const segments: string[] = [];
    let continuationToken: string | undefined;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `hls/${movieId}/`,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      });

      const response = await r2Client().send(command);
      const objects = response.Contents || [];
      
      const segmentFiles = objects
        .map(obj => obj.Key || '')
        .filter(key => key.endsWith('.ts'))
        .map(key => key.replace(`hls/${movieId}/`, ''));
      
      segments.push(...segmentFiles);
      continuationToken = response.NextContinuationToken;
      
    } while (continuationToken);
    
    return segments.sort(); // Sort by name for easier analysis
  }

  private async checkSegment(movieId: string, segmentPath: string): Promise<SegmentCheck> {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `hls/${movieId}/${segmentPath}`
      });

      const response = await r2Client().send(command);
      const size = response.ContentLength || 0;
      
      // Basic validation
      let isValid = true;
      let error: string | undefined;
      
      if (size === 0) {
        isValid = false;
        error = 'Empty file (0 bytes)';
      } else if (size < 1000) {
        isValid = false;
        error = `Suspiciously small (${size} bytes)`;
      } else if (!response.Body) {
        isValid = false;
        error = 'No body data';
      } else {
        // Check first few bytes for TS packet header (0x47)
        const chunks: Buffer[] = [];
        const stream = response.Body as any;
        let bytesRead = 0;
        
        for await (const chunk of stream) {
          chunks.push(chunk);
          bytesRead += chunk.length;
          if (bytesRead >= 188) break; // TS packet size
        }
        
        if (chunks.length > 0) {
          const firstBytes = Buffer.concat(chunks);
          if (firstBytes[0] !== 0x47) {
            isValid = false;
            error = 'Invalid TS packet header';
          }
        }
      }
      
      return {
        segment: segmentPath,
        size,
        isValid,
        error
      };
      
    } catch (error) {
      return {
        segment: segmentPath,
        size: 0,
        isValid: false,
        error: `Access error: ${error}`
      };
    }
  }

  private analyzeResults(results: SegmentCheck[], movieTitle: string): void {
    const totalSegments = results.length;
    const validSegments = results.filter(r => r.isValid).length;
    const corruptedSegments = results.filter(r => !r.isValid);
    
    console.log(`\n📊 Integrity Report for: ${movieTitle}`);
    console.log(`   Total segments: ${totalSegments}`);
    console.log(`   Valid segments: ${validSegments} (${((validSegments / totalSegments) * 100).toFixed(1)}%)`);
    console.log(`   Corrupted segments: ${corruptedSegments.length} (${((corruptedSegments.length / totalSegments) * 100).toFixed(1)}%)`);
    
    if (corruptedSegments.length > 0) {
      console.log(`\n❌ Corrupted Segments:`);
      corruptedSegments.forEach((segment, i) => {
        if (i < 10) { // Show first 10
          console.log(`   ${segment.segment}: ${segment.error} (${segment.size} bytes)`);
        }
      });
      
      if (corruptedSegments.length > 10) {
        console.log(`   ... and ${corruptedSegments.length - 10} more corrupted segments`);
      }
      
      console.log(`\n💡 Recommendations:`);
      if (corruptedSegments.length > totalSegments * 0.05) {
        console.log(`   🔄 High corruption rate (${((corruptedSegments.length / totalSegments) * 100).toFixed(1)}%) - recommend full reconversion`);
        console.log(`   Command: npm run convert-to-hls -- --movie-id ${movieTitle} --force`);
      } else {
        console.log(`   🔄 Low corruption rate - try resuming uploads to fix missing segments`);
        console.log(`   Command: npm run resume-uploads -- ${movieTitle}`);
      }
    } else {
      console.log(`\n✅ All segments are valid!`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: tsx check-segment-integrity.ts <movie-id>');
    console.log('');
    console.log('Example:');
    console.log('  tsx check-segment-integrity.ts 359f9e74-b0a3-427a-bdf5-6b7f3af7fa65');
    process.exit(1);
  }

  const movieId = args[0];
  const checker = new SegmentIntegrityChecker();
  
  checker.checkMovieSegments(movieId)
    .then(() => {
      console.log('\n✅ Segment integrity check complete');
    })
    .catch((error) => {
      console.error('❌ Check failed:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

export { SegmentIntegrityChecker };
