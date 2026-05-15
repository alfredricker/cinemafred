import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { validateAdmin } from '@/lib/middleware';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/data/cinemafred';

async function deleteMediaFile(relativePath: string): Promise<void> {
  const fullPath = path.resolve(MEDIA_ROOT, relativePath);
  if (!fullPath.startsWith(path.resolve(MEDIA_ROOT))) return;
  try {
    await fs.rm(fullPath, { force: true });
  } catch (error) {
    console.error(`Failed to delete media file: ${relativePath}`, error);
    throw error;
  }
}

async function deleteHLSDirectory(movieId: string): Promise<void> {
  const fullPath = path.resolve(MEDIA_ROOT, 'hls', movieId);
  if (!fullPath.startsWith(path.resolve(MEDIA_ROOT))) return;
  try {
    await fs.rm(fullPath, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to delete HLS directory for movie: ${movieId}`, error);
    throw error;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const movie = await prisma.movie.findUnique({
      where: { id },
      include: {
        ratings: {
          orderBy: { created_at: 'desc' },
          include: { user: { select: { username: true, id: true } } }
        },
        reviews: {
          orderBy: { created_at: 'desc' },
          include: { user: { select: { username: true, id: true } } }
        },
        _count: { select: { ratings: true, reviews: true } }
      }
    });

    if (!movie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
    }

    return NextResponse.json(movie);
  } catch (error) {
    console.error('Error fetching movie:', error);
    return NextResponse.json({ error: 'Failed to fetch movie' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const updates = await request.json();

    const requiredFields = ['title', 'year', 'director', 'genre', 'description'];
    const missingFields = requiredFields.filter(field => !updates[field]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    const existingMovie = await prisma.movie.findUnique({ where: { id } });
    if (!existingMovie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
    }

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
        cloudflare_video_id: updates.cloudflare_video_id,
        ...(updates.averageRating !== undefined && { averageRating: updates.averageRating }),
      }
    });

    return NextResponse.json({ message: 'Movie updated successfully', movie: updatedMovie });
  } catch (error) {
    console.error('Error updating movie:', error);
    return NextResponse.json({ error: 'Failed to update movie' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const existingMovie = await prisma.movie.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        r2_image_path: true,
        r2_subtitles_path: true,
        r2_hls_path: true,
        hls_ready: true,
      }
    });

    if (!existingMovie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
    }

    const deleteOps: Promise<void>[] = [];

    if (existingMovie.r2_video_path) {
      deleteOps.push(deleteMediaFile(existingMovie.r2_video_path));
    }
    if (existingMovie.r2_image_path) {
      deleteOps.push(deleteMediaFile(existingMovie.r2_image_path));
    }
    if (existingMovie.r2_subtitles_path) {
      deleteOps.push(deleteMediaFile(existingMovie.r2_subtitles_path));
    }
    if (existingMovie.hls_ready) {
      deleteOps.push(deleteHLSDirectory(existingMovie.id));
    }

    const results = await Promise.allSettled(deleteOps);
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`${failures.length} file delete(s) failed for movie: ${existingMovie.title}`);
    }

    await prisma.$transaction([
      prisma.rating.deleteMany({ where: { movie_id: id } }),
      prisma.review.deleteMany({ where: { movie_id: id } }),
      prisma.movie.delete({ where: { id: id } }),
    ]);

    return NextResponse.json({
      message: `Movie "${existingMovie.title}" deleted successfully`,
      deletedFiles: {
        video: !!existingMovie.r2_video_path,
        image: !!existingMovie.r2_image_path,
        subtitles: !!existingMovie.r2_subtitles_path,
        hls: existingMovie.hls_ready && !!existingMovie.r2_hls_path,
      }
    });
  } catch (error) {
    console.error('Error deleting movie:', error);
    return NextResponse.json({ error: 'Failed to delete movie' }, { status: 500 });
  }
}
