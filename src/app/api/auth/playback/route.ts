import { NextResponse } from 'next/server';
import { requirePlayback, privateHeaders } from '@/lib/playback-session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return (await requirePlayback(req)) ?? new NextResponse(null, { status: 204, headers: privateHeaders });
}
