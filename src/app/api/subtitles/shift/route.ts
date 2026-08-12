import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db';
import { shiftVTTTimestamps } from '@/lib/subtitles';

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/data/cinemafred';
const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fileId = Number(body.fileId);
    const movieId = typeof body.movieId === 'string' ? body.movieId : '';
    const offsetMs = Number(body.offsetMs);

    if (!Number.isSafeInteger(fileId) || fileId <= 0 || !movieId) {
      return NextResponse.json({ error: 'A valid movie and subtitle are required' }, { status: 400 });
    }
    if (!Number.isSafeInteger(offsetMs) || Math.abs(offsetMs) > MAX_SHIFT_MS) {
      return NextResponse.json({ error: 'Shift must be a whole number of milliseconds within 24 hours' }, { status: 400 });
    }

    const prisma = getPrismaClient();
    const cached = await prisma.cachedSubtitle.findFirst({
      where: { os_file_id: fileId, movie_id: movieId },
      select: { path: true },
    });
    if (!cached) {
      return NextResponse.json({ error: 'Select and load this subtitle before shifting it' }, { status: 404 });
    }

    const mediaRoot = path.resolve(MEDIA_ROOT);
    const fullPath = path.resolve(mediaRoot, cached.path);
    if (!fullPath.startsWith(`${mediaRoot}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid subtitle path' }, { status: 400 });
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const shifted = shiftVTTTimestamps(content, offsetMs);
    const temporaryPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, shifted, 'utf-8');
    await fs.rename(temporaryPath, fullPath);

    return NextResponse.json({ ok: true, offsetMs });
  } catch (error) {
    console.error('Failed to shift subtitle:', error);
    return NextResponse.json({ error: 'Failed to shift subtitle' }, { status: 500 });
  }
}
