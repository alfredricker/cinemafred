import { NextResponse } from 'next/server';
import { getSessionUser, privateHeaders } from '@/lib/playback-session';

export async function POST(req: Request) {
  try {
    const user = await getSessionUser(req);
    return NextResponse.json({ valid: Boolean(user), user }, { status: user ? 200 : 401, headers: privateHeaders });
  } catch {
    return NextResponse.json({ valid: false }, { status: 503, headers: privateHeaders });
  }
}
