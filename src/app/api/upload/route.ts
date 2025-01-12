// src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { validateAdmin } from '@/lib/middleware';
import { v4 as uuidv4 } from 'uuid';

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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file || !type) {
      return NextResponse.json(
        { error: 'File and type are required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!['video', 'image', 'subtitles'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }

    // Generate unique filename at root level
    const extension = file.name.split('.').pop();
    // Include the type in the filename for easier identification
    const filename = `${type}_${uuidv4()}.${extension}`;

    // Convert File to Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filename,
        Body: uint8Array,
        ContentType: file.type,
      })
    );

    return NextResponse.json({ path: filename });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}