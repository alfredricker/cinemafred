// src/app/api/movies/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Get query parameters from the request URL
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search') || undefined;
    const genre = url.searchParams.get('genre') || undefined;
    const year = url.searchParams.get('year') ? parseInt(url.searchParams.get('year')!) : undefined;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build where clause
    let whereClause: Prisma.MovieWhereInput = {};

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { director: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (genre) {
      whereClause.genre = { has: genre };
    }

    if (year) {
      whereClause.year = year;
    }

    // Fetch movies with count
    const [movies, total] = await Promise.all([
      prisma.movie.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          year: true,
          director: true,
          genre: true,
          rating: true,
          r2_image_path: true,
          r2_video_path: true,
          description: true,
          _count: {
            select: {
              ratings: true,
              reviews: true
            }
          }
        }
      }),
      prisma.movie.count({ where: whereClause })
    ]);

    // Calculate average ratings for each movie
    const moviesWithAggregates = await Promise.all(
      movies.map(async (movie) => {
        const averageRating = await prisma.rating.aggregate({
          where: { movie_id: movie.id },
          _avg: { value: true }
        });

        return {
          ...movie,
          averageRating: averageRating._avg.value || movie.rating
        };
      })
    );

    return NextResponse.json({
      movies: moviesWithAggregates,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    console.error('Error fetching movies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch movies' },
      { status: 500 }
    );
  }
}