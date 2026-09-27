import { requirePlayback } from '@/lib/playback-session';
import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getOpenSubtitlesService } from '@/lib/opensubtitles';
import { convertSRTtoVTT } from '@/lib/subtitles';
import { getPrismaClient } from '@/lib/db';

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/data/cinemafred';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await requirePlayback(req);
  if (denied) return denied;
  const { searchParams } = req.nextUrl;
  const fileId = parseInt(searchParams.get('fileId') ?? '');
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

  const prisma = getPrismaClient();

  // Check if already cached on disk
  const cached = await prisma.cachedSubtitle.findUnique({ where: { os_file_id: fileId } });
  if (cached) {
    try {
      const fullPath = path.resolve(MEDIA_ROOT, cached.path);
      const vtt = await fs.readFile(fullPath, 'utf-8');
      return new Response(vtt, { headers: { 'Content-Type': 'text/vtt', 'Cache-Control': 'private, no-store' } });
    } catch {
      // File missing from disk — fall through to re-download
      await prisma.cachedSubtitle.delete({ where: { os_file_id: fileId } }).catch(() => {});
    }
  }

  // Download from OpenSubtitles
  const service = getOpenSubtitlesService();
  if (!service) return NextResponse.json({ error: 'OpenSubtitles not configured' }, { status: 503 });

  const token = await service.login(
    process.env.OPENSUBTITLES_USERNAME,
    process.env.OPENSUBTITLES_PASSWORD,
  );

  const download = await service.getDownloadLink(fileId, token);
  if (!download) return NextResponse.json({ error: 'Download failed' }, { status: 500 });

  const subRes = await fetch(download.link);
  if (!subRes.ok) return NextResponse.json({ error: 'Subtitle fetch failed' }, { status: 500 });

  const content = await subRes.text();
  const vtt = download.fileName.endsWith('.srt') ? convertSRTtoVTT(content) : content;

  // Persist to disk and DB if we have the movie context
  const movieId = searchParams.get('movieId');
  const language = searchParams.get('language') ?? 'en';
  const label = searchParams.get('label') ?? download.fileName;

  if (movieId) {
    const relPath = `subtitles/cache/${fileId}.vtt`;
    const fullPath = path.resolve(MEDIA_ROOT, relPath);
    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, vtt, 'utf-8');
      await prisma.cachedSubtitle.create({
        data: { movie_id: movieId, os_file_id: fileId, path: relPath, language, label },
      });
    } catch (err) {
      console.error('Failed to cache subtitle:', err);
      // Non-fatal — still return the content
    }
  }

  return new Response(vtt, {
    headers: {
      'Content-Type': 'text/vtt',
      'Cache-Control': 'private, no-store',
    },
  });
}
