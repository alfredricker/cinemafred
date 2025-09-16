import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { prisma } from '@/lib/prisma';

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
      const { hlsR2Manager } = await import('@/lib/hls-r2');
      
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

    const response = await r2Client.send(command);
    
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
