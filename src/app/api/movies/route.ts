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

    // Determine sorting logic
    const isTitleSort = sort === 'title-asc' || sort === 'title-desc';
    let orderBy: Prisma.MovieOrderByWithRelationInput = {};

    if (!isTitleSort) {
      switch (sort) {
        case 'rating-desc':
          orderBy = { averageRating: 'desc' };  // Use precomputed averageRating
          break;
        case 'rating-asc':
          orderBy = { averageRating: 'asc' };  // Use precomputed averageRating
          break;
        case 'year-desc':
          orderBy = { year: 'desc' };
          break;
        case 'year-asc':
          orderBy = { year: 'asc' };
          break;
      }
    }

    // Fetch movies
    const [movies, total] = await Promise.all([
      prisma.movie.findMany({
        where: whereClause,
        orderBy: isTitleSort ? undefined : orderBy,
        select: {
          id: true,
          title: true,
          year: true,
          director: true,
          genre: true,
          rating: true,
          averageRating: true,  // Now using stored avgRating
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

    // If sorting by title, sort manually
    if (isTitleSort) {
      movies.sort((a, b) => {
        const titleA = getSortableTitle(a.title);
        const titleB = getSortableTitle(b.title);
        return sort === 'title-asc'
          ? titleA.localeCompare(titleB)
          : titleB.localeCompare(titleA);
      });
    }

    // Apply pagination after sorting
    const paginatedMovies = movies.slice(skip, skip + limit);

    return NextResponse.json({
      movies: paginatedMovies,
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
