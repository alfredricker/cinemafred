import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import prisma from '@/lib/db';

// Rate limiting for HLS requests
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const segmentRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 100; // Max 30 requests per minute per IP (0.5 req/sec)
const MAX_SEGMENT_REQUESTS_PER_MINUTE = 5; // Max 5 requests per segment per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const key = `hls_${ip}`;
  
  const current = rateLimitMap.get(key);
  
  if (!current || now > current.resetTime) {
    // Reset or initialize
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (current.count >= MAX_REQUESTS_PER_MINUTE) {
    return false; // Rate limited
  }
  
  current.count++;
  return true;
}

function checkSegmentRateLimit(ip: string, segmentPath: string): boolean {
  const now = Date.now();
  const key = `segment_${ip}_${segmentPath}`;
  
  const current = segmentRateLimitMap.get(key);
  
  if (!current || now > current.resetTime) {
    // Reset or initialize
    segmentRateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (current.count >= MAX_SEGMENT_REQUESTS_PER_MINUTE) {
    return false; // Rate limited
  }
  
  current.count++;
  return true;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
  for (const [key, value] of segmentRateLimitMap.entries()) {
    if (now > value.resetTime) {
      segmentRateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Add CORS headers for OPTIONS requests
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Validate authentication token from request
 */
function validateStreamToken(request: Request): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  
  if (!token) {
    return false;
  }

  try {
    // Basic token validation - you might want to implement JWT validation here
    return token.length > 0;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { movieId: string; segments: string[] } }
) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 
              request.headers.get('x-real-ip') || 
              'unknown';
    
    if (!checkRateLimit(ip)) {
      console.log(`Rate limited HLS request from IP: ${ip}`);
      return NextResponse.json({ 
        error: "Too many requests",
        message: "Rate limit exceeded. Max 30 requests per minute."
      }, { 
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '30',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(Date.now() + RATE_LIMIT_WINDOW).toISOString()
        }
      });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    
    console.log(`HLS Segment request: ${request.url}`);
    console.log(`Token present: ${!!token}, Token length: ${token?.length || 0}`);
    
    // Validate authentication
    if (!validateStreamToken(request)) {
      console.log('Token validation failed for segment request');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { movieId, segments } = params;
    
    // Reconstruct the path from segments
    const segmentPath = segments.join('/');
    
    // Additional rate limiting for specific segments to prevent retry storms
    if (!checkSegmentRateLimit(ip, segmentPath)) {
      console.log(`🚫 Segment rate limited: ${ip} requesting ${segmentPath} (too many requests)`);
      return NextResponse.json({ 
        error: "Too many requests for this segment",
        message: "Segment rate limit exceeded. Max 5 requests per segment per minute."
      }, { 
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(Date.now() + RATE_LIMIT_WINDOW).toISOString()
        }
      });
    }
    
    // Log segment requests for debugging
    console.log(`📺 HLS Segment request: ${ip} -> ${movieId}/${segmentPath}`);
    
    console.log(`HLS Segment request: ${movieId}/${segmentPath}`);

    // Find the movie in the database
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: { 
        r2_hls_path: true, 
        hls_ready: true,
        title: true 
      }
    });

    if (!movie) {
      return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    }

    if (!movie.hls_ready || !movie.r2_hls_path) {
      return NextResponse.json({ 
        error: "HLS not available for this movie" 
      }, { status: 404 });
    }

    // Handle bitrate playlist requests specially
    if (segmentPath.endsWith('/playlist.m3u8')) {
      // This is a bitrate playlist request - we need to generate it with authenticated segment URLs
      const bitrate = segmentPath.replace('/playlist.m3u8', '');
      
      console.log(`Generating authenticated bitrate playlist for: ${bitrate}`);
      
      // Import the HLS manager here to avoid circular imports
      const { hlsR2Manager } = await import('@/lib/hls/r2');
      
      try {
        const playlistContent = await hlsR2Manager.generateAuthenticatedBitratePlaylist(
          movieId,
          bitrate,
          token || ''
        );
        
        console.log(`Generated bitrate playlist content (first 200 chars):`, playlistContent.substring(0, 200));
        
        return new Response(playlistContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'max-age=60',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
          }
        });
      } catch (error) {
        console.error('Error generating bitrate playlist:', error);
        return NextResponse.json({ error: "Failed to generate playlist" }, { status: 500 });
      }
    }

    // Determine the R2 key based on the segment path
    let r2Key: string;
    
    if (segmentPath.endsWith('.ts')) {
      // This is a segment request (e.g., "480p/segment_000.ts")
      r2Key = `hls/${movieId}/${segmentPath}`;
    } else {
      return NextResponse.json({ error: "Invalid segment path" }, { status: 400 });
    }

    console.log(`Fetching R2 key: ${r2Key}`);

    // Handle range requests for better streaming performance
    const rangeHeader = request.headers.get('range');
    
    // Fetch the file from R2 with range support
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
      ...(rangeHeader && { Range: rangeHeader })
    });

    const response = await r2Client().send(command);
    
    if (!response.Body) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    // Stream the response directly without buffering
    const stream = response.Body as ReadableStream;
    
    // Determine content type
    let contentType: string;
    if (segmentPath.endsWith('.m3u8')) {
      contentType = 'application/vnd.apple.mpegurl';
    } else if (segmentPath.endsWith('.ts')) {
      contentType = 'video/mp2t';
    } else {
      contentType = response.ContentType || 'application/octet-stream';
    }

    // Set appropriate headers with performance optimizations
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Accept-Ranges': 'bytes',
    };

    // Cache headers based on file type
    if (segmentPath.endsWith('.ts')) {
      // Segments are immutable, cache for 1 year
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      headers['Vary'] = 'Accept-Encoding';
    } else if (segmentPath.endsWith('.m3u8')) {
      // Playlists should be cached briefly
      headers['Cache-Control'] = segmentPath === 'playlist.m3u8' 
        ? 'public, max-age=300' // Master playlist: 5 minutes
        : 'public, max-age=60';  // Bitrate playlist: 1 minute
    }

    // Forward relevant headers from R2 response
    if (response.ContentLength) {
      headers['Content-Length'] = response.ContentLength.toString();
    }
    if (response.ETag) {
      headers['ETag'] = response.ETag;
    }
    if (response.LastModified) {
      headers['Last-Modified'] = response.LastModified.toUTCString();
    }
    if (response.ContentRange) {
      headers['Content-Range'] = response.ContentRange;
    }

    // Determine status code based on range request
    const statusCode = rangeHeader && response.ContentRange ? 206 : 200;

    return new Response(stream, {
      status: statusCode,
      headers
    });

  } catch (error) {
    console.error("HLS Segment Error:", error);
    return NextResponse.json(
      { error: "Failed to serve HLS segment" },
      { status: 500 }
    );
  }
}
