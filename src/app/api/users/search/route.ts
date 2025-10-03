import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const dynamic = 'force-dynamic';

// Search users by username
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    jwt.verify(token, JWT_SECRET);

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    if (query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: query,
          mode: 'insensitive'
        },
        isActive: true
      },
      select: {
        id: true,
        username: true
      },
      take: 10,
      orderBy: {
        username: 'asc'
      }
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
  }
}

