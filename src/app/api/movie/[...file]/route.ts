import { NextResponse } from 'next/server';
import { mediaUrl } from '@/lib/media';
import { convertSRTtoVTT } from '@/lib/subtitles';
import { requirePlayback, privateHeaders } from '@/lib/playback-session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const { file } = await params;
  const filePath = file.join('/');
  let protectedUrl: string;
  try { protectedUrl = mediaUrl(filePath); } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }
  // Only poster images are public. An image suffix on a private path is not enough.
  const isPoster = file[0] === 'images' && /\.(jpe?g|png|webp|gif|avif)$/i.test(filePath);
  if (!isPoster) {
    const denied = await requirePlayback(req);
    if (denied) return denied;
  }
  if (isPoster || filePath.endsWith('.srt')) {
    // This origin must remain loopback-only and must never be tunnelled publicly.
    const upstream = await fetch(`http://127.0.0.1:8080/${file.map(encodeURIComponent).join('/')}`, { redirect: 'error', cache: 'no-store' });
    if (!upstream.ok) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    if (!isPoster) {
      return new Response(convertSRTtoVTT(await upstream.text()), {
        headers: { ...privateHeaders, 'Content-Type': 'text/vtt' },
      });
    }
    return new Response(upstream.body, { headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    } });
  }
  return new NextResponse(null, { status: 307, headers: { ...privateHeaders, Location: protectedUrl } });
}
