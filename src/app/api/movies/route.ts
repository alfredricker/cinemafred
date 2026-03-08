// src/app/api/movies/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { validateAdmin } from '@/lib/middleware';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

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
        hls_ready: false, // Will be set to true when conversion completes
      }
    });

    return NextResponse.json({
      message: 'Movie created successfully and HLS conversion started (original MP4 will be deleted after conversion)',
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
      whereClause.title = { contains: search, mode: 'insensitive' };
    }

    if (genre) {
      whereClause.genre = { has: genre };
    }

    if (year) {
      whereClause.year = year;
    }

    // Determine sorting logic
    let orderBy: Prisma.MovieOrderByWithRelationInput = {};

    switch (sort) {
      case 'title-desc':
        orderBy = { title: 'desc' };
        break;
      case 'title-asc':
        orderBy = { title: 'asc' };
        break;
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
      case 'created-desc':
        orderBy = { created_at: 'desc' };
        break;
      default:
        orderBy = { title: 'asc' };
        break;
    }

    // In Workers, sequential queries are more stable with adapter-based clients.
    const movies = await prisma.movie.findMany({
      where: whereClause,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        year: true,
        rating: true,
        averageRating: true,
        r2_image_path: true,
        _count: {
          select: {
            ratings: true,
            reviews: true
          }
        }
      }
    });
    const total = await prisma.movie.count({ where: whereClause });

    return NextResponse.json({
      movies,
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
