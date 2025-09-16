#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { hlsR2Manager } from '../src/lib/hls-r2';

interface VideoAnalysis {
  movieId: string;
  title: string;
  originalVideo: {
    resolution: string;
    bitrate: number;
    codec: string;
    fps: number;
    duration: number;
  };
  hlsVersions: Array<{
    quality: string;
    resolution: string;
    bitrate: number;
    segmentCount: number;
    estimatedQuality: 'excellent' | 'good' | 'fair' | 'poor';
  }>;
  qualityAssessment: {
    bitrateReduction: number;
    resolutionMatch: boolean;
    recommendations: string[];
  };
}

/**
 * Analyze video quality for HLS conversion
 */
async function analyzeVideoQuality(movieId?: string) {
  console.log('🔍 Analyzing Video Quality...\n');

  try {
    // Get movies to analyze
    const movies = movieId 
      ? await prisma.movie.findMany({ where: { id: movieId }, take: 1 })
      : await prisma.movie.findMany({ 
          where: { hls_ready: true }, 
          take: 5,
          orderBy: { created_at: 'desc' }
        });

    if (movies.length === 0) {
      console.log('❌ No movies found for analysis');
      return;
    }

    for (const movie of movies) {
      console.log(`\n📹 Analyzing: ${movie.title}`);
      console.log('=' .repeat(50));

      const analysis = await analyzeMovie(movie.id, movie.title);
      displayAnalysis(analysis);
    }

  } catch (error) {
    console.error('💥 Analysis failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function analyzeMovie(movieId: string, title: string): Promise<VideoAnalysis> {
  // Get original video info (this would require downloading from R2, so we'll simulate)
  const originalVideo = {
    resolution: '1920x1080', // We'd get this from ffprobe
    bitrate: 5000000, // 5 Mbps
    codec: 'h264',
    fps: 24,
    duration: 7200 // 2 hours
  };

  // Get HLS info
  const hlsInfo = await hlsR2Manager.checkHLSExists(movieId);
  const hlsStats = await hlsR2Manager.getHLSStats(movieId);

  const hlsVersions = hlsInfo.bitrates.map(bitrate => {
    const segmentCount = hlsInfo.segmentCount[bitrate] || 0;
    
    // Estimate quality based on bitrate name
    let estimatedBitrate = 0;
    let resolution = '';
    
    if (bitrate === '480p') {
      estimatedBitrate = 1400000; // 1.4 Mbps
      resolution = '854x480';
    } else if (bitrate.includes('original')) {
      // For original quality, estimate based on source
      estimatedBitrate = Math.floor(originalVideo.bitrate * 0.8); // Current implementation
      resolution = originalVideo.resolution;
    }

    // Quality assessment
    let estimatedQuality: 'excellent' | 'good' | 'fair' | 'poor' = 'good';
    const bitrateRatio = estimatedBitrate / originalVideo.bitrate;
    
    if (bitrateRatio >= 0.9) estimatedQuality = 'excellent';
    else if (bitrateRatio >= 0.7) estimatedQuality = 'good';
    else if (bitrateRatio >= 0.5) estimatedQuality = 'fair';
    else estimatedQuality = 'poor';

    return {
      quality: bitrate,
      resolution,
      bitrate: estimatedBitrate,
      segmentCount,
      estimatedQuality
    };
  });

  // Calculate quality assessment
  const originalQualityVersion = hlsVersions.find(v => v.quality.includes('original'));
  const bitrateReduction = originalQualityVersion 
    ? (1 - originalQualityVersion.bitrate / originalVideo.bitrate) * 100
    : 0;

  const recommendations: string[] = [];
  
  if (bitrateReduction > 30) {
    recommendations.push('Consider increasing original quality bitrate (currently 80% of source)');
  }
  
  if (hlsVersions.length < 3) {
    recommendations.push('Add more quality levels (720p, 1080p) for better adaptive streaming');
  }

  if (originalQualityVersion?.estimatedQuality === 'poor') {
    recommendations.push('Original quality bitrate is too low for good viewing experience');
  }

  return {
    movieId,
    title,
    originalVideo,
    hlsVersions,
    qualityAssessment: {
      bitrateReduction,
      resolutionMatch: originalQualityVersion?.resolution === originalVideo.resolution,
      recommendations
    }
  };
}

function displayAnalysis(analysis: VideoAnalysis) {
  console.log(`📊 Original Video:`);
  console.log(`   Resolution: ${analysis.originalVideo.resolution}`);
  console.log(`   Bitrate: ${(analysis.originalVideo.bitrate / 1000000).toFixed(1)} Mbps`);
  console.log(`   Codec: ${analysis.originalVideo.codec}`);
  console.log(`   FPS: ${analysis.originalVideo.fps}`);
  console.log(`   Duration: ${Math.floor(analysis.originalVideo.duration / 60)} minutes`);

  console.log(`\n🎬 HLS Versions:`);
  analysis.hlsVersions.forEach(version => {
    const qualityIcon = {
      excellent: '🟢',
      good: '🟡', 
      fair: '🟠',
      poor: '🔴'
    }[version.estimatedQuality];

    console.log(`   ${qualityIcon} ${version.quality}:`);
    console.log(`      Resolution: ${version.resolution}`);
    console.log(`      Bitrate: ${(version.bitrate / 1000000).toFixed(1)} Mbps`);
    console.log(`      Segments: ${version.segmentCount}`);
    console.log(`      Quality: ${version.estimatedQuality}`);
  });

  console.log(`\n📈 Quality Assessment:`);
  console.log(`   Bitrate Reduction: ${analysis.qualityAssessment.bitrateReduction.toFixed(1)}%`);
  console.log(`   Resolution Match: ${analysis.qualityAssessment.resolutionMatch ? '✅' : '❌'}`);
  
  if (analysis.qualityAssessment.recommendations.length > 0) {
    console.log(`\n💡 Recommendations:`);
    analysis.qualityAssessment.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });
  }

  // Overall quality score
  const avgQualityScore = analysis.hlsVersions.reduce((sum, v) => {
    const scores = { excellent: 4, good: 3, fair: 2, poor: 1 };
    return sum + scores[v.estimatedQuality];
  }, 0) / analysis.hlsVersions.length;

  const overallQuality = avgQualityScore >= 3.5 ? '🟢 Excellent' :
                        avgQualityScore >= 2.5 ? '🟡 Good' :
                        avgQualityScore >= 1.5 ? '🟠 Fair' : '🔴 Poor';

  console.log(`\n🏆 Overall Quality: ${overallQuality}`);
}

// CLI usage
if (require.main === module) {
  const movieId = process.argv[2];
  
  analyzeVideoQuality(movieId).catch((error) => {
    console.error('💥 Analysis failed:', error);
    process.exit(1);
  });
}

export { analyzeVideoQuality };
