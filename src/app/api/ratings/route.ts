import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const dynamic = 'force-dynamic';

// Get all movies with ratings for specified users
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    
    const { userIds } = await request.json();
    
    // Include the current user in the list if not already present
    const allUserIds = userIds.includes(decoded.id) 
      ? userIds 
      : [decoded.id, ...userIds];

    // Get all movies with their ratings
    const movies = await prisma.movie.findMany({
      select: {
        id: true,
        title: true,
        year: true,
        averageRating: true,
        ratings: {
          where: {
            user_id: {
              in: allUserIds
            }
          },
          select: {
            value: true,
            user_id: true,
            user: {
              select: {
                username: true,
                id: true
              }
            }
          }
        }
      },
      orderBy: {
        title: 'asc'
      }
    });

    // Get user details for all requested users
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: allUserIds
        }
      },
      select: {
        id: true,
        username: true
      }
    });

    return NextResponse.json({ 
      movies,
      users,
      currentUserId: decoded.id
    });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 });
  }
}

