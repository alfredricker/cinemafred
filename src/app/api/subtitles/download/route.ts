import { NextRequest, NextResponse } from 'next/server';
import { getOpenSubtitlesService } from '@/lib/opensubtitles';
import { convertSRTtoVTT } from '@/lib/subtitles';

export async function GET(req: NextRequest) {
  const fileId = parseInt(req.nextUrl.searchParams.get('fileId') ?? '');
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

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

  return new Response(vtt, {
    headers: {
      'Content-Type': 'text/vtt',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
