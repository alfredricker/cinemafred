import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Mark as dynamic route
export const dynamic = 'force-dynamic';

// Get user's current rating
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };

    const rating = await prisma.rating.findUnique({
      where: {
        user_id_movie_id: {
          user_id: decoded.id,
          movie_id: params.id
        }
      }
    });

    return NextResponse.json({ rating: rating?.value || null });
  } catch (error) {
    console.error('Error fetching rating:', error);
    return NextResponse.json({ error: 'Failed to fetch rating' }, { status: 500 });
  }
}

// Submit or update rating
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const { value } = await request.json();

    // Validate rating value
    if (typeof value !== 'number' || value < 0 || value > 10) {
      return NextResponse.json({ error: 'Invalid rating value' }, { status: 400 });
    }

    // Use a transaction to update rating & averageRating efficiently
    const result = await prisma.$transaction(async (tx) => {
      // Upsert the rating
      await tx.rating.upsert({
        where: {
          user_id_movie_id: {
            user_id: decoded.id,
            movie_id: params.id
          }
        },
        update: { value },
        create: {
          user_id: decoded.id,
          movie_id: params.id,
          value
        }
      });

      // Recalculate averageRating
      const { _avg } = await tx.rating.aggregate({
        where: { movie_id: params.id },
        _avg: { value: true }
      });

      // Update `averageRating` field in the `Movie` table
      const updatedMovie = await tx.movie.update({
        where: { id: params.id },
        data: { averageRating: _avg.value || 0 },
        select: { averageRating: true }
      });

      return updatedMovie;
    });

    return NextResponse.json({
      message: 'Rating updated successfully',
      averageRating: result.averageRating
    });
  } catch (error) {
    console.error('Error updating rating:', error);
    return NextResponse.json({ error: 'Failed to update rating' }, { status: 500 });
  }
}
