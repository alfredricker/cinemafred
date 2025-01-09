//src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return NextResponse.json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}