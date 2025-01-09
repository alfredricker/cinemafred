//src/app/api/users/route.ts
import { validateAdmin, validateInput } from '@/lib/middleware';
import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function generateTemporaryPassword() {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  return Array.from(Array(5), () => charset[Math.floor(Math.random() * charset.length)]).join('');
}

export async function GET(request: Request) {
  try {
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const users = await prisma.user.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        email: true,
        username: true,
        is_active: true,
        is_admin: true,
        must_reset_password: true,
        created_at: true
      }
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { email } = await request.json();
    
    const validationErrors = validateInput({ email }, {
      email: {
        required: true,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        maxLength: 255,
      }
    });

    if (validationErrors) {
      return NextResponse.json({ errors: validationErrors }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;
    
    while (true) {
      const existingUsername = await prisma.user.findUnique({
        where: { username }
      });
      
      if (!existingUsername) break;
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password_hash: hashedPassword,
        is_active: true,
        is_admin: false,
        must_reset_password: true
      }
    });

    return NextResponse.json({
      message: 'User created successfully',
      userId: user.id,
      tempPassword,
      username
    });

  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}