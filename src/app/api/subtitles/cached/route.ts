import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const movieId = req.nextUrl.searchParams.get('movieId');
  if (!movieId) return NextResponse.json({ error: 'movieId required' }, { status: 400 });

  const prisma = getPrismaClient();
  const rows = await prisma.cachedSubtitle.findMany({
    where: { movie_id: movieId },
    orderBy: { created_at: 'desc' },
    select: { os_file_id: true, path: true, language: true, label: true, created_at: true },
  });

  return NextResponse.json(rows);
}
