import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import prisma from '@/lib/db';
import { hlsR2Manager } from '@/lib/hls/r2';
import { hlsHybridManager, HLSHybridManager } from '@/lib/hls/hybrid';

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
  { params }: { params: { movieId: string } }
) {
  try {
    // Validate authentication
    if (!validateStreamToken(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { movieId } = params;
    const url = new URL(request.url);
    const bitrate = url.searchParams.get('bitrate');
    
    // Check if this is a bitrate playlist request from the URL path
    const pathParts = url.pathname.split('/');
    const isPlaylistRequest = pathParts[pathParts.length - 1] === 'playlist.m3u8';
    const bitrateFromPath = isPlaylistRequest ? pathParts[pathParts.length - 2] : null;

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
        error: "HLS not available for this movie",
        hlsReady: false 
      }, { status: 404 });
    }

    const token = url.searchParams.get('token') || '';
    const useHybrid = url.searchParams.get('hybrid') === 'true' || HLSHybridManager.shouldUseHybridMode();

    console.log(`HLS API request: ${request.url}`);
    console.log(`Token: ${token}, UseHybrid: ${useHybrid}, Bitrate: ${bitrate || 'master'}`);

    try {
      if (bitrate) {
        // Serve specific bitrate playlist
        let playlistContent: string;
        
        if (useHybrid) {
          // Use hybrid mode: signed URLs for segments (better performance)
          playlistContent = await hlsHybridManager.generateHybridBitratePlaylist(
            movieId,
            bitrate,
            3600 // 1 hour expiry for signed URLs
          );
        } else {
          // Use proxy mode: API URLs for segments (better security/CORS)
          playlistContent = await hlsR2Manager.generateAuthenticatedBitratePlaylist(
            movieId,
            bitrate,
            token
          );
        }

        console.log(`Generated bitrate playlist (${bitrate}):`, playlistContent.substring(0, 500) + '...');

        return new Response(playlistContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'max-age=60', // Cache bitrate playlists for 1 minute
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
          }
        });
      } else {
        // Serve master playlist
        let masterPlaylistContent: string;
        
        if (useHybrid) {
          // Use hybrid mode: API for playlists, signed URLs for segments
          masterPlaylistContent = await hlsHybridManager.generateHybridMasterPlaylist(
            movieId,
            token
          );
        } else {
          // Use proxy mode: API for everything
          const { authenticatedMasterPlaylist } = await hlsR2Manager.generateAuthenticatedHLSUrls(
            movieId,
            token
          );
          masterPlaylistContent = authenticatedMasterPlaylist;
        }

        console.log(`Generated master playlist:`, masterPlaylistContent.substring(0, 500) + '...');

        return new Response(masterPlaylistContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'max-age=300', // Cache master playlist for 5 minutes
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
          }
        });
      }
    } catch (hlsError) {
      console.error(`HLS streaming error for movie ${movieId}:`, hlsError);
      return NextResponse.json({ 
        error: "HLS streaming failed",
        details: hlsError instanceof Error ? hlsError.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error("HLS API Error:", error);
    return NextResponse.json(
      { error: "Failed to serve HLS stream" },
      { status: 500 }
    );
  }
}
