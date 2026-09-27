import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getJwtSecret } from '@/lib/jwt-secret';

export const SESSION_COOKIE = 'cinemafred_session';
const SESSION_SECONDS = 90 * 24 * 60 * 60;
const sessionOptions = { algorithms: ['HS256'] as jwt.Algorithm[], audience: 'cinemafred-playback', issuer: 'cinemafred' };
export const privateHeaders = { 'Cache-Control': 'private, no-store' };

export function setSessionCookie(response: NextResponse, userId: string) {
  const token = jwt.sign({}, getJwtSecret(), {
    algorithm: 'HS256', subject: userId, audience: sessionOptions.audience,
    issuer: sessionOptions.issuer, expiresIn: SESSION_SECONDS,
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/', maxAge: 0,
  });
}

export async function getSessionUser(request: Request) {
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  let subject: string;
  try {
    const payload = jwt.verify(token, getJwtSecret(), sessionOptions);
    if (typeof payload === 'string' || !payload.sub || typeof payload.exp !== 'number') return null;
    subject = payload.sub;
  } catch {
    return null;
  }
  // Never trust account status embedded in an old token.
  const user = await prisma.user.findUnique({
    where: { id: subject },
    select: { id: true, username: true, email: true, isAdmin: true, isActive: true, mustResetPassword: true },
  });
  return user?.isActive ? { ...user, isGuest: false } : null;
}

export async function requirePlayback(request: Request): Promise<NextResponse | null> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in to watch' }, { status: 401, headers: privateHeaders });
    if (user.mustResetPassword) return NextResponse.json({ error: 'Password reset required' }, { status: 403, headers: privateHeaders });
    return null;
  } catch {
    return NextResponse.json({ error: 'Playback authorization unavailable' }, { status: 503, headers: privateHeaders });
  }
}
