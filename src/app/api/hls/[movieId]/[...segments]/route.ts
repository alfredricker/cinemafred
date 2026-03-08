import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import prisma from '@/lib/db';
// @ts-ignore
import { env as cfEnv } from "cloudflare:workers";

// Rate limiting for HLS requests
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const segmentRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 1000; // Max 1000 requests per minute per IP (relaxed for HLS)
const MAX_SEGMENT_REQUESTS_PER_MINUTE = 50; // Max 50 requests per segment per minute per IP

function cleanupExpiredRateLimitEntries(now: number) {
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
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  cleanupExpiredRateLimitEntries(now);
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
  cleanupExpiredRateLimitEntries(now);
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
      // Relaxed for production HLS
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
    // Hard-stop repeated requests to the same segment to avoid retry storms/cost spikes.
    if (!checkSegmentRateLimit(ip, segmentPath)) {
      console.log(`🚫 Segment hard-limited: ${ip} requesting ${segmentPath} too frequently`);
      return NextResponse.json(
        { error: 'Segment request rate limited' },
        {
          status: 429,
          headers: {
            'Retry-After': '30',
            'Cache-Control': 'private, no-store',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
          },
        }
      );
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
    let stream: ReadableStream | null = null;
    let r2Response: any = null;
    let buffer: ArrayBuffer | null = null;
    
    // Try native R2 binding first
    if (cfEnv && cfEnv.R2) {
      const options: any = {};
      if (rangeHeader) {
        // Parse range header (e.g., "bytes=0-100")
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          options.range = {};
          if (match[1]) options.range.offset = parseInt(match[1], 10);
          if (match[2]) options.range.length = parseInt(match[2], 10) - (options.range.offset || 0) + 1;
        }
      }
      
      const object = await cfEnv.R2.get(r2Key, options);
      if (object) {
        buffer = await object.arrayBuffer();
        r2Response = {
          ContentLength: object.size,
          ETag: object.etag,
          LastModified: object.uploaded,
          ContentType: object.httpMetadata?.contentType
        };
      }
    }
    
    // Fallback to S3 client
    if (!buffer && !stream) {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
        ...(rangeHeader && { Range: rangeHeader })
      });

      const response = await r2Client().send(command);
      if (response.Body) {
        stream = response.Body as ReadableStream;
        r2Response = response;
      }
    }
    
    if (!buffer && !stream) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }
    
    // Determine content type
    let contentType: string;
    if (segmentPath.endsWith('.m3u8')) {
      contentType = 'application/vnd.apple.mpegurl';
    } else if (segmentPath.endsWith('.ts')) {
      contentType = 'video/mp2t';
    } else {
      contentType = r2Response.ContentType || 'application/octet-stream';
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
    if (r2Response.ContentLength) {
      headers['Content-Length'] = r2Response.ContentLength.toString();
    }
    if (r2Response.ETag) {
      headers['ETag'] = r2Response.ETag;
    }
    if (r2Response.LastModified) {
      const lastMod = r2Response.LastModified instanceof Date 
        ? r2Response.LastModified.toUTCString() 
        : new Date(r2Response.LastModified).toUTCString();
      headers['Last-Modified'] = lastMod;
    }
    if (r2Response.ContentRange) {
      headers['Content-Range'] = r2Response.ContentRange;
    }

    // Determine status code based on range request
    const statusCode = rangeHeader && r2Response.ContentRange ? 206 : 200;

    return new Response(buffer || stream, {
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
