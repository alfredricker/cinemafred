import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Mark as dynamic route
export const dynamic = 'force-dynamic';

// Submit or update review
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
    const { reviewText, rating } = await request.json();

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { isAdmin: true }
    });

    if (user?.isAdmin) {
      return NextResponse.json({ error: 'Admins cannot rate or review movies' }, { status: 403 });
    }

    // Validate rating value
    if (typeof rating !== 'number' || rating < 1 || rating > 10) {
      return NextResponse.json({ error: 'Invalid rating value (must be 1-10)' }, { status: 400 });
    }

    // Use a transaction to update both review and rating
    const result = await prisma.$transaction(async (tx) => {
      // Upsert the review
      const review = await tx.review.upsert({
        where: {
          user_id_movie_id: {
            user_id: decoded.id,
            movie_id: params.id
          }
        },
        update: { 
          rating,
          review_text: reviewText || null
        },
        create: {
          user_id: decoded.id,
          movie_id: params.id,
          rating,
          review_text: reviewText || null
        }
      });

      // Also update/create the rating entry
      await tx.rating.upsert({
        where: {
          user_id_movie_id: {
            user_id: decoded.id,
            movie_id: params.id
          }
        },
        update: { value: rating },
        create: {
          user_id: decoded.id,
          movie_id: params.id,
          value: rating
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

      return { review, averageRating: updatedMovie.averageRating };
    });

    return NextResponse.json({
      message: 'Review submitted successfully',
      review: result.review,
      averageRating: result.averageRating
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 });
  }
}

// Get user's review for a movie
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

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { isAdmin: true }
    });

    if (user?.isAdmin) {
      return NextResponse.json({ 
        review: null,
        rating: null,
        reviewText: null
      });
    }

    const review = await prisma.review.findUnique({
      where: {
        user_id_movie_id: {
          user_id: decoded.id,
          movie_id: params.id
        }
      }
    });

    return NextResponse.json({ 
      review: review || null,
      rating: review?.rating || null,
      reviewText: review?.review_text || null
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    return NextResponse.json({ error: 'Failed to fetch review' }, { status: 500 });
  }
}

