import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { validateAdmin } from '@/lib/middleware';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

/**
 * Helper function to delete a file from R2 storage
 */
async function deleteR2File(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    await r2Client().send(command);
    console.log(`✅ Deleted R2 file: ${key}`);
  } catch (error) {
    console.error(`❌ Failed to delete R2 file: ${key}`, error);
    throw error;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const movie = await prisma.movie.findUnique({
      where: { id },
      include: {
        ratings: {
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
        reviews: {
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

    return NextResponse.json(movie); // No need to compute averageRating manually
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

    // Update movie (excluding `averageRating` unless explicitly provided)
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
        ...(updates.averageRating !== undefined && { averageRating: updates.averageRating }) // Optional update
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

    // Check if movie exists and get all file paths
    const existingMovie = await prisma.movie.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        r2_video_path: true,
        r2_image_path: true,
        r2_subtitles_path: true,
        r2_hls_path: true,
        hls_ready: true
      }
    });

    if (!existingMovie) {
      return NextResponse.json(
        { error: 'Movie not found' },
        { status: 404 }
      );
    }

    console.log(`🗑️ Deleting movie: ${existingMovie.title} (${id})`);

    // Delete files from Cloudflare R2 storage
    const deletePromises: Promise<void>[] = [];

    // Delete video file
    if (existingMovie.r2_video_path) {
      const videoKey = existingMovie.r2_video_path.replace(/^api\/movie\//, '');
      console.log(`Deleting video: ${videoKey}`);
      deletePromises.push(deleteR2File(videoKey));
    }

    // Delete image file
    if (existingMovie.r2_image_path) {
      const imageKey = existingMovie.r2_image_path.replace(/^api\/movie\//, '');
      console.log(`Deleting image: ${imageKey}`);
      deletePromises.push(deleteR2File(imageKey));
    }

    // Delete subtitles file
    if (existingMovie.r2_subtitles_path) {
      const subtitlesKey = existingMovie.r2_subtitles_path.replace(/^api\/movie\//, '');
      console.log(`Deleting subtitles: ${subtitlesKey}`);
      deletePromises.push(deleteR2File(subtitlesKey));
    }

    // Delete HLS files if they exist
    if (existingMovie.hls_ready && existingMovie.r2_hls_path) {
      console.log(`Deleting HLS files for movie: ${id}`);
      const { hlsR2Manager } = await import('@/lib/hls/r2');
      deletePromises.push(hlsR2Manager.deleteHLSFiles(id));
    }

    // Execute all R2 deletions in parallel
    try {
      await Promise.all(deletePromises);
      console.log(`✅ Successfully deleted all R2 files for movie: ${existingMovie.title}`);
    } catch (r2Error) {
      console.error('⚠️ Some R2 files could not be deleted:', r2Error);
      // Continue with database deletion even if some R2 files failed
      // This prevents orphaned database records
    }

    // Delete related records from database
    await prisma.$transaction([
      prisma.rating.deleteMany({ where: { movie_id: id } }),
      prisma.review.deleteMany({ where: { movie_id: id } }),
      prisma.movie.delete({ where: { id } })
    ]);

    console.log(`✅ Successfully deleted movie from database: ${existingMovie.title}`);

    return NextResponse.json({
      message: `Movie "${existingMovie.title}" deleted successfully`,
      deletedFiles: {
        video: !!existingMovie.r2_video_path,
        image: !!existingMovie.r2_image_path,
        subtitles: !!existingMovie.r2_subtitles_path,
        hls: existingMovie.hls_ready && !!existingMovie.r2_hls_path
      }
    });
  } catch (error) {
    console.error('Error deleting movie:', error);
    return NextResponse.json(
      { error: 'Failed to delete movie' },
      { status: 500 }
    );
  }
}
