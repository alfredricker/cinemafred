// src/app/api/movies/poster/route.ts
import { NextResponse } from 'next/server';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { validateAdmin } from '@/lib/middleware';

export async function POST(request: Request) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { imageUrl } = await request.json();
    
    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    // Download the image from TMDB
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download image from TMDB');
    }

    // Get the image data as a buffer
    const imageData = await imageResponse.arrayBuffer();

    // Generate a unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const filename = `poster_${timestamp}_${randomString}.jpg`;

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: Buffer.from(imageData),
      ContentType: 'image/jpeg'
    });

    await r2Client().send(command);

    return NextResponse.json({ 
      filename,
      path: `api/movie/${filename}` 
    });

  } catch (error) {
    console.error('Error downloading poster:', error);
    return NextResponse.json(
      { error: 'Failed to download and store poster' },
      { status: 500 }
    );
  }
}