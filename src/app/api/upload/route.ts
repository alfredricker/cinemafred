import { NextResponse } from 'next/server';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { validateAdmin } from '@/lib/middleware';

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

    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    let filename = sanitizedFilename;
    
    // Check if file exists by attempting to get its metadata
    try {
      await r2Client.send(
        new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: filename,
        })
      );
      
      // File exists, create a unique name by appending a timestamp
      const extension = sanitizedFilename.split('.').pop();
      const baseName = sanitizedFilename.slice(0, -(extension?.length ?? 0) - 1);
      const timestamp = new Date().getTime();
      filename = `${baseName}_${timestamp}.${extension}`;
    } catch (err: any) {
      // If error code is 404, file doesn't exist and we can use original name
      // Otherwise, rethrow the error
      if (!err.name || err.name !== 'NotFound') {
        throw err;
      }
    }

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