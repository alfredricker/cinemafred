// src/app/api/movies/[id]/update-duration/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { validateAdmin } from '@/lib/middleware';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { duration } = await request.json();
    
    // Validate input
    if (typeof duration !== 'number' || duration <= 0) {
      return NextResponse.json(
        { error: 'Invalid duration' },
        { status: 400 }
      );
    }

    // Update movie duration
    await prisma.movie.update({
      where: { id: params.id },
      data: { duration }
    });

    return NextResponse.json({ message: 'Duration updated successfully' });
  } catch (error) {
    console.error('Error updating duration:', error);
    return NextResponse.json(
      { error: 'Failed to update duration' },
      { status: 500 }
    );
  }
}