import { setSessionCookie, privateHeaders } from '@/lib/playback-session';
//src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/db';

import { getJwtSecret } from '@/lib/jwt-secret';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const validPassword = await compare(password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 });
    }

    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        mustResetPassword: user.mustResetPassword
      },
      getJwtSecret(),
      { expiresIn: '90d' }
    );

    const { password_hash: _passwordHash, ...publicUser } = user;
    const response = NextResponse.json({ token, user: publicUser }, { headers: privateHeaders });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}