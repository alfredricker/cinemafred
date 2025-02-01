// src/app/api/movies/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { validateAdmin } from '@/lib/middleware'

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

// Helper function to sort titles ignoring leading "The"
function getSortableTitle(title: string): string {
  return title.replace(/^the\s+/i, '').toLowerCase();
}

export async function POST(request: Request) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const data = await request.json();
    
    // Validate required fields
    const requiredFields = ['title', 'year', 'director', 'genre', 'description', 'r2_video_path', 'r2_image_path'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Create movie in database
    const movie = await prisma.movie.create({
      data: {
        title: data.title,
        year: data.year,
        director: data.director,
        genre: data.genre,
        description: data.description,
        r2_video_path: data.r2_video_path,
        r2_image_path: data.r2_image_path,
        r2_subtitles_path: data.r2_subtitles_path || null,
        rating: 0, // Initial rating
      }
    });

    return NextResponse.json({
      message: 'Movie created successfully',
      movie
    });
  } catch (error) {
    console.error('Error creating movie:', error);
    return NextResponse.json(
      { error: 'Failed to create movie' },
      { status: 500 }
    );
  }
}


export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search') || undefined;
    const genre = url.searchParams.get('genre') || undefined;
    const sort = url.searchParams.get('sort') || 'title-asc';
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

    // Build orderBy clause based on sort parameter
    let orderBy: Prisma.MovieOrderByWithRelationInput = {};
    
    switch (sort) {
      case 'title-desc':
        orderBy = { title: 'desc' };
        break;
      case 'rating-desc':
        orderBy = { rating: 'desc' };
        break;
      case 'rating-asc':
        orderBy = { rating: 'asc' };
        break;
      case 'year-desc':
        orderBy = { year: 'desc' };
        break;
      case 'year-asc':
        orderBy = { year: 'asc' };
        break;
      default: // 'title-asc'
        orderBy = { title: 'asc' };
    }

    // Fetch movies with count
    const [movies, total] = await Promise.all([
      prisma.movie.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy,
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