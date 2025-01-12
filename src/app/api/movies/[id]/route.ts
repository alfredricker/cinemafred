// src/app/api/movies/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { validateAdmin } from '@/lib/middleware';

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

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const { id } = params;
    const updates = await request.json();

    // Validate required fields
    const requiredFields = ['title', 'year', 'director', 'genre', 'description'];
    const missingFields = requiredFields.filter(field => !updates[field]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if movie exists
    const existingMovie = await prisma.movie.findUnique({
      where: { id }
    });

    if (!existingMovie) {
      return NextResponse.json(
        { error: 'Movie not found' },
        { status: 404 }
      );
    }

    // Update movie
    const updatedMovie = await prisma.movie.update({
      where: { id },
      data: {
        title: updates.title,
        year: updates.year,
        director: updates.director,
        genre: updates.genre,
        description: updates.description,
        r2_video_path: updates.r2_video_path || existingMovie.r2_video_path,
        r2_image_path: updates.r2_image_path || existingMovie.r2_image_path,
        r2_subtitles_path: updates.r2_subtitles_path,
        streaming_url: updates.streaming_url,
        cloudflare_video_id: updates.cloudflare_video_id
      }
    });

    return NextResponse.json({
      message: 'Movie updated successfully',
      movie: updatedMovie
    });
  } catch (error) {
    console.error('Error updating movie:', error);
    return NextResponse.json(
      { error: 'Failed to update movie' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const { id } = params;

    // Check if movie exists
    const existingMovie = await prisma.movie.findUnique({
      where: { id }
    });

    if (!existingMovie) {
      return NextResponse.json(
        { error: 'Movie not found' },
        { status: 404 }
      );
    }

    // Delete related records first
    await prisma.$transaction([
      prisma.rating.deleteMany({ where: { movie_id: id } }),
      prisma.review.deleteMany({ where: { movie_id: id } }),
      prisma.movie.delete({ where: { id } })
    ]);

    return NextResponse.json({
      message: 'Movie deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting movie:', error);
    return NextResponse.json(
      { error: 'Failed to delete movie' },
      { status: 500 }
    );
  }
}