// src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { validateAdmin } from '@/lib/middleware';

// Define valid file types
type FileType = 'video' | 'image' | 'subtitles';

// Define allowed extensions for each type
const allowedTypes: Record<FileType, string[]> = {
  video: ['mp4'],
  image: ['jpg', 'jpeg', 'png'],
  subtitles: ['srt', 'vtt']
};

export async function POST(request: Request) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const body = await request.json();
    const { filename, type, contentType } = body;

    if (!filename || !type || !contentType) {
      console.error('Missing fields:', { filename, type, contentType });
      return NextResponse.json({ 
        error: 'Filename, type, and contentType are required' 
      }, { status: 400 });
    }

    // Validate file type
    if (!['video', 'image', 'subtitles'].includes(type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Must be video, image, or subtitles' 
      }, { status: 400 });
    }

    // Get the file extension
    const extension = filename.split('.').pop()?.toLowerCase();
    
    // Type assertion to ensure type is valid
    const validFileType = type as FileType;
    
    if (!extension || !allowedTypes[validFileType].includes(extension)) {
      return NextResponse.json({ 
        error: `Invalid file type for ${type}. Allowed: ${allowedTypes[validFileType].join(', ')}` 
      }, { status: 400 });
    }

    // Generate organized file path based on type
    let organizedPath: string;
    switch (type) {
      case 'video':
        organizedPath = `movies/${filename}`;
        break;
      case 'image':
        organizedPath = `images/${filename}`;
        break;
      case 'subtitles':
        organizedPath = `subtitles/${filename}`;
        break;
      default:
        organizedPath = filename;
    }

    // Create command for presigned URL
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: organizedPath,
      ContentType: contentType
    });

    // Generate presigned URL (valid for 30 minutes)
    const presignedUrl = await getSignedUrl(r2Client(), command, { expiresIn: 1800 });

    return NextResponse.json({
      presignedUrl,
      filename,
      organizedPath
    });

  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';