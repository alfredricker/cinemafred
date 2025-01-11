// src/app/api/movies/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const movie = await prisma.movie.findUnique({
      where: { id },
      include: {
        reviews: {
          take: 10,
          orderBy: { created_at: 'desc' },
          include: {
            user: {
              select: {
                username: true,
                id: true
              }
            }
          }
        },
        _count: {
          select: {
            ratings: true,
            reviews: true
          }
        }
      }
    });

    if (!movie) {
      return NextResponse.json(
        { error: 'Movie not found' },
        { status: 404 }
      );
    }

    // Get average rating
    const averageRating = await prisma.rating.aggregate({
      where: { movie_id: id },
      _avg: { value: true }
    });

    // Combine movie data with aggregated rating
    const movieWithRating = {
      ...movie,
      averageRating: averageRating._avg.value || movie.rating
    };

    return NextResponse.json(movieWithRating);
  } catch (error) {
    console.error('Error fetching movie:', error);
    return NextResponse.json(
      { error: 'Failed to fetch movie' },
      { status: 500 }
    );
  }
}