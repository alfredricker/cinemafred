import { NextResponse } from 'next/server';
import { clearSessionCookie, privateHeaders } from '@/lib/playback-session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const response = NextResponse.json({ ok: true }, { headers: privateHeaders });
  clearSessionCookie(response);
  return response;
}
