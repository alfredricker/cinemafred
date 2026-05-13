import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { mediaUrl } from '@/lib/media';

function validateStreamToken(request: Request): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  return Boolean(token && token.length > 0);
}

export async function OPTIONS() {
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

export async function GET(
  request: Request,
  { params }: { params: { movieId: string } }
) {
  if (!validateStreamToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const movie = await prisma.movie.findUnique({
    where: { id: params.movieId },
    select: { r2_hls_path: true, hls_ready: true }
  });

  if (!movie?.hls_ready || !movie.r2_hls_path) {
    return NextResponse.json({ error: 'HLS not available', hlsReady: false }, { status: 404 });
  }

  return NextResponse.redirect(mediaUrl(movie.r2_hls_path));
}
