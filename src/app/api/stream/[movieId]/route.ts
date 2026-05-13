import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { mediaUrl } from '@/lib/media';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function validateStreamToken(request: Request): boolean {
  try {
    const authHeader = request.headers.get('Authorization');
    let token: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const url = new URL(request.url);
      token = url.searchParams.get('token');
    }

    if (!token) return false;
    jwt.verify(token, JWT_SECRET, { complete: true });
    return true;
  } catch {
    return false;
  }
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
    select: { r2_video_path: true }
  });

  if (!movie?.r2_video_path) {
    return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
  }

  return NextResponse.redirect(mediaUrl(movie.r2_video_path));
}
