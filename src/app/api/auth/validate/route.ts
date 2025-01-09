// src/app/api/auth/validate/route.ts
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    return NextResponse.json({ valid: true, user: decoded });
  } catch (error) {
    return NextResponse.json({ valid: false, error: 'Invalid token' }, { status: 401 });
  }
}