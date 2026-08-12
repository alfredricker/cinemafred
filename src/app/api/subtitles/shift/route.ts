import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db';
import { validateAdmin } from '@/lib/middleware';
import { shiftSubtitleTimestamps, stretchSubtitleTimestamps } from '@/lib/subtitles';

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/data/cinemafred';
const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;
const MAX_STRETCH_PERCENT = 1000;

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fileId = body.fileId == null ? null : Number(body.fileId);
    const movieId = typeof body.movieId === 'string' ? body.movieId : '';
    const source = body.source === 'local' ? 'local' : 'cached';
    const offsetMs = Number(body.offsetMs);
    const stretchPercent = body.stretchPercent == null ? null : Number(body.stretchPercent);
    const isStretch = stretchPercent !== null;

    if (!movieId || (source === 'cached' && (!Number.isSafeInteger(fileId) || fileId! <= 0)))
      return NextResponse.json({ error: 'A valid movie and subtitle are required' }, { status: 400 });
    if (!isStretch && (!Number.isSafeInteger(offsetMs) || Math.abs(offsetMs) > MAX_SHIFT_MS)) {
      return NextResponse.json({ error: 'Shift must be a whole number of milliseconds within 24 hours' }, { status: 400 });
    }
    if (isStretch) {
      const validation = await validateAdmin(req);
      if ('error' in validation) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
      if (!Number.isFinite(stretchPercent) || stretchPercent <= -100 || Math.abs(stretchPercent) > MAX_STRETCH_PERCENT) {
        return NextResponse.json({ error: 'Stretch must be greater than -100% and no more than 1000%' }, { status: 400 });
      }
    }

    const prisma = getPrismaClient();
    const subtitlePath = source === 'local'
      ? (await prisma.movie.findUnique({ where: { id: movieId }, select: { r2_subtitles_path: true } }))?.r2_subtitles_path
      : (await prisma.cachedSubtitle.findFirst({
          where: { os_file_id: fileId!, movie_id: movieId }, select: { path: true },
        }))?.path;
    if (!subtitlePath) return NextResponse.json({ error: 'Subtitle file was not found' }, { status: 404 });

    const mediaRoot = path.resolve(MEDIA_ROOT);
    const fullPath = path.resolve(mediaRoot, subtitlePath);
    if (!fullPath.startsWith(`${mediaRoot}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid subtitle path' }, { status: 400 });
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const shifted = isStretch
      ? stretchSubtitleTimestamps(content, stretchPercent)
      : shiftSubtitleTimestamps(content, offsetMs);
    const temporaryPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, shifted, 'utf-8');
    await fs.rename(temporaryPath, fullPath);

    return NextResponse.json({ ok: true, ...(isStretch ? { stretchPercent } : { offsetMs }) });
  } catch (error) {
    console.error('Failed to shift subtitle:', error);
    return NextResponse.json({ error: 'Failed to shift subtitle' }, { status: 500 });
  }
}
