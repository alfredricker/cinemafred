// src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { hash, compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    const db = getDB();

    // Find user by username instead of email
    const user = await db
      .prepare('SELECT * FROM users WHERE username = ?')
      .bind(username)
      .first();

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const validPassword = await compare(password, user.passwordHash);
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

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        mustResetPassword: user.mustResetPassword
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}