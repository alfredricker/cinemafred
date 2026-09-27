import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { mediaUrl } from '@/lib/media';
import { requirePlayback, privateHeaders } from '@/lib/playback-session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ movieId: string }> }) {
  const denied = await requirePlayback(request);
  if (denied) return denied;
  const { movieId } = await params;
  const movie = await prisma.movie.findUnique({
    where: { id: movieId }, select: { r2_hls_path: true, hls_ready: true },
  });
  if (!movie?.r2_hls_path || !movie.hls_ready) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404, headers: privateHeaders });
  }
  return new NextResponse(null, { status: 307, headers: { ...privateHeaders, Location: mediaUrl(movie.r2_hls_path) } });
}
